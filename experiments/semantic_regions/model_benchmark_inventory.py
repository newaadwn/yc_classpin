"""Record installed versions and actual local model hashes, without dataset content."""
import importlib.metadata
from pathlib import Path
from compare_visual_layout import save, LAYOUT_MODEL, LAYOUT_REVISION
from probe_florence2 import MODEL_ID, MODEL_REVISION
from run_local_semantic_grouping import sha256_file


def main():
    paths={
        'easyocr':Path('C:/Users/praisy/.EasyOCR/model'),
        'paddleocr-det':Path('C:/Users/praisy/.paddlex/official_models/PP-OCRv5_mobile_det'),
        'paddleocr-rec':Path('C:/Users/praisy/.paddlex/official_models/korean_PP-OCRv5_mobile_rec'),
        'pps':Path('C:/Users/praisy/.paddlex/official_models/PP-DocLayout-S'),
        'tesseract':Path('.local/tessdata')}
    files={}
    for name,root in paths.items():
        files[name]=[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha256_file(p)}
            for p in root.iterdir() if p.is_file() and p.suffix in {'.pth','.pdiparams','.json','.yml','.traineddata'}]
    data={'versions':{n:importlib.metadata.version(n) for n in ('torch','torchvision','transformers','numpy','easyocr','paddleocr','paddlepaddle','paddlex')},
        'files':files,'hfPinned':{'ppv3':{'id':LAYOUT_MODEL,'revision':LAYOUT_REVISION},
            'florence':{'id':MODEL_ID,'revision':MODEL_REVISION}},
        'precision':{'easyocr':'Reader default quantize=True CPU dynamic quantization',
            'paddleocr':'Paddle CPU MKLDNN disabled','pps':'Paddle CPU MKLDNN disabled',
            'ppv3':'torch float32','florence':'torch float32','llm':'GGUF Q4_K_M'}}
    save(Path('output/model-benchmark-v1/inventory.json'),data)


if __name__=='__main__':main()
