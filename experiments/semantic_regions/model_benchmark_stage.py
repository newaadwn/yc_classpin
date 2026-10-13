"""Interchangeable local OCR/layout engines; all consume the same redacted images."""
import argparse
import json
import os
import time
from pathlib import Path

from PIL import Image
from compare_visual_layout import normalized_box, draw_overlay, LAYOUT_MODEL, LAYOUT_REVISION, save
from extract_image_regions import words_to_lines
from ocr_redaction import run_tesseract_tsv, parse_tesseract_tsv, redact_text
from probe_florence2 import MODEL_ID, MODEL_REVISION, run_task
from semantic_region_v2 import require_safe_baseline
from run_local_semantic_grouping import sha256_file

ENGINES = ['tesseract', 'easyocr', 'paddleocr', 'ppv3', 'pps', 'florence']


def create_engine(name):
    if name == 'tesseract':
        return None
    if name == 'easyocr':
        import torch
        import easyocr
        torch.set_num_threads(4)
        return easyocr.Reader(['ko', 'en'], gpu=False, verbose=False)
    if name in {'paddleocr','pps'}:
        from paddleocr import PaddleOCR, LayoutDetection
        common=dict(device='cpu', cpu_threads=4, enable_mkldnn=False)
        if name == 'pps':
            return LayoutDetection(model_name='PP-DocLayout-S', threshold=.45, **common)
        return PaddleOCR(text_detection_model_name='PP-OCRv5_mobile_det',
            text_recognition_model_name='korean_PP-OCRv5_mobile_rec',
            use_doc_orientation_classify=False, use_doc_unwarping=False,
            use_textline_orientation=False, **common)
    import torch
    from transformers import AutoProcessor, AutoImageProcessor, AutoModelForObjectDetection, Florence2ForConditionalGeneration
    torch.set_num_threads(4)
    if name == 'ppv3':
        return (AutoImageProcessor.from_pretrained(LAYOUT_MODEL, revision=LAYOUT_REVISION),
                AutoModelForObjectDetection.from_pretrained(LAYOUT_MODEL, revision=LAYOUT_REVISION).eval())
    return (AutoProcessor.from_pretrained(MODEL_ID,revision=MODEL_REVISION),
            Florence2ForConditionalGeneration.from_pretrained(MODEL_ID,revision=MODEL_REVISION,
            torch_dtype=torch.float32,low_cpu_mem_usage=True).eval())


def predict(name, engine, path):
    """Return raw pixel xyxy, observed label/text, score. No inferred OCR."""
    import numpy as np
    with Image.open(path) as im:
        image=im.convert('RGB')
    if name == 'tesseract':
        words=parse_tesseract_tsv(run_tesseract_tsv('C:/Program Files/Tesseract-OCR/tesseract.exe',
            path,'kor+eng',Path('.local/tessdata').resolve()))
        return [(r['bboxPx'],r['text'],r['confidence']) for r in words_to_lines(words)]
    if name == 'easyocr':
        # EasyOCR's ndarray contract is BGR (reformat_input uses COLOR_BGR2GRAY).
        output=engine.readtext(np.asarray(image)[:,:,::-1].copy(),detail=1,paragraph=False,batch_size=1,workers=0)
        return [([min(p[0] for p in b),min(p[1] for p in b),max(p[0] for p in b),max(p[1] for p in b)],t,s) for b,t,s in output]
    if name in {'paddleocr','pps'}:
        # An ndarray avoids Windows non-ASCII pathname limitations in native readers.
        out=list(engine.predict(np.asarray(image)[:,:,::-1].copy()))[0]
        if name=='paddleocr':
            return [(list(b),t,float(s)) for b,t,s in zip(out['rec_boxes'],out['rec_texts'],out['rec_scores'])]
        return [(r['coordinate'],r['label'],r['score']) for r in out['boxes']]
    import torch
    processor,model=engine
    if name=='ppv3':
        inputs=processor(images=image,return_tensors='pt')
        with torch.inference_mode(): output=model(**inputs)
        detections=processor.post_process_object_detection(output,threshold=.45,target_sizes=[(image.height,image.width)])[0]
        return [(b.tolist(),model.config.id2label[int(l)],float(s)) for b,l,s in zip(detections['boxes'],detections['labels'],detections['scores'])]
    result=run_task(model=model,processor=processor,image=image,task_prompt='<DENSE_REGION_CAPTION>',max_new_tokens=768,torch=torch)
    parsed=result['parsed']['<DENSE_REGION_CAPTION>']
    # Captions are unverified English descriptions, not document class labels.
    return [(b,'image',0.0) for b in parsed.get('bboxes',[])]


def run(args):
    os.environ['OMP_NUM_THREADS']='4'
    os.environ['MKL_NUM_THREADS']='4'
    os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK']='True'
    source=json.loads(args.manifest.read_text(encoding='utf-8')); require_safe_baseline(source)
    started=time.perf_counter(); engine=create_engine(args.engine)
    load_ms=(time.perf_counter()-started)*1000
    if args.prepare:
        print(json.dumps({'prepared':args.engine,'setupMs':load_ms}),flush=True)
        return
    if args.output.exists():raise FileExistsError('Preserve previous run; use a new output')
    args.output.mkdir(parents=True)
    ocr=args.engine in {'tesseract','easyocr','paddleocr'}
    data={'schemaVersion':'model-benchmark-stage.v1','engine':args.engine,'stage':'ocr' if ocr else 'layout',
          'status':'running','modelLoadMs':load_ms,'threads':4,'device':'cpu','pages':[]}
    try:
        for page in source['pages']:
            path=(args.manifest.parent/page['renderedImage']).resolve()
            path.relative_to(args.manifest.parent.resolve())
            with Image.open(path) as im: width,height=im.size
            t=time.perf_counter(); output=predict(args.engine,engine,path); elapsed=(time.perf_counter()-t)*1000
            regions=[]
            for box,text,score in output:
                try: bbox=normalized_box(box,width,height)
                except ValueError: continue
                regions.append({'alias':f'R{len(regions)+1:03d}','bboxNorm':bbox,
                    'label':'text' if ocr else text,'type':'paragraph' if ocr else text,
                    'textRedacted':redact_text(text)[0] if ocr else '', 'score':float(score)})
            regions.sort(key=lambda r:(round(r['bboxNorm']['y1'],2),r['bboxNorm']['x1']))
            for i,r in enumerate(regions): r['alias']=f'R{i+1:03d}'; r['readingOrder']=i+1
            record={'pageNumber':page['pageNumber'],'widthPx':width,'heightPx':height,
                    'sourceSha256':sha256_file(path),'inferenceMs':elapsed,'regions':regions}
            data['pages'].append(record);save(args.output/'result.json',data)
            with Image.open(path) as im:draw_overlay(im.convert('RGB'),regions,args.output/f"page-{page['pageNumber']:02d}.jpg")
            print(json.dumps({'engine':args.engine,'page':page['pageNumber'],'ms':round(elapsed),'regions':len(regions)}),flush=True)
        data['status']='complete'
    except Exception as error:
        data['status']='failed';data['errorType']=type(error).__name__
        raise
    finally:
        data['inferenceMs']=sum(p['inferenceMs'] for p in data['pages'])
        data['totalInternalMs']=(time.perf_counter()-started)*1000
        save(args.output/'result.json',data)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--engine',choices=ENGINES,required=True)
    p.add_argument('--manifest',type=Path,default=Path('output/report-ablation-v1/ocr/manifest.json'))
    p.add_argument('--output',type=Path)
    p.add_argument('--prepare',action='store_true')
    a=p.parse_args()
    if not a.prepare and a.output is None:p.error('--output required')
    run(a)
