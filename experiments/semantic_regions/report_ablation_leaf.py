"""Post-hoc D candidate: suppress large layout parents, keep page context."""
import argparse
import copy
import json
import time
from pathlib import Path
from report_ablation import (PROFILE_4B, REFERENCE, inputs_for, schema, validate_result,
    aggregate, run_llama_server_batch, sha256_file, save, map_deck_anchors, redact_text)


def leaf_layout(layout, baseline=None):
    result=copy.deepcopy(layout)
    for page in result['pages']:
        kept=[]
        for region in page['regions']:
            b=region['bboxNorm']; area=(b['x2']-b['x1'])*(b['y2']-b['y1'])
            children=0
            for other in page['regions']:
                o=other['bboxNorm']; x=(o['x1']+o['x2'])/2; y=(o['y1']+o['y2'])/2
                if other['alias']!=region['alias'] and b['x1']<=x<=b['x2'] and b['y1']<=y<=b['y2'] and (o['x2']-o['x1'])*(o['y2']-o['y1'])<area/2:
                    children+=1
            if region['label']=='image' and area>.25 and children>=3:
                continue
            kept.append(region)
        page['regions']=kept
        if baseline:
            original=next(p for p in baseline['pages'] if p['pageNumber']==page['pageNumber'])
            for region in kept:
                if region['label'] not in {'text','paragraph_title'}:continue
                b=region['bboxNorm']; cx=(b['x1']+b['x2'])/2; cy=(b['y1']+b['y2'])/2
                nearby=[]
                for o in original['regions']:
                    ob=o['bboxNorm']; ox=(ob['x1']+ob['x2'])/2; oy=(ob['y1']+ob['y2'])/2
                    if abs(ox-cx)<=.25 and abs(oy-cy)<=.04 and o.get('textRedacted'):
                        nearby.append(o)
                nearby.sort(key=lambda r:r.get('readingOrder',0))
                region['nearbyOcrAliases']=[o['alias'] for o in nearby]
                region['textRedacted']='\n'.join(dict.fromkeys([region['textRedacted']]+[o['textRedacted'] for o in nearby])).strip()
    return result


def main(args):
    if args.output.exists() or sha256_file(args.model)!=PROFILE_4B['sha256']:
        raise ValueError('Use a new output and pinned model')
    source=json.loads((args.run/'results.json').read_text(encoding='utf-8'))
    if source['status']!='complete':raise ValueError('A/B/C must finish first')
    args.output.mkdir(parents=True)
    baseline=json.loads((args.run/'ocr/manifest.json').read_text(encoding='utf-8'))
    layout=json.loads((args.run/'layout/layout.json').read_text(encoding='utf-8'))
    start=time.perf_counter(); leaves=leaf_layout(layout,baseline)
    questions=json.loads(args.questions.read_text(encoding='utf-8'))['questions']
    mappings=map_deck_anchors(leaves,questions)
    mapping_ms=(time.perf_counter()-start)*1000
    save(args.output/'mapping.json',{'postHoc':True,'rule':'drop image parents area>0.25 with >=3 children; unchanged 0.06 nearest threshold; nearby OCR center dx<=0.25 dy<=0.04', 'mappings':mappings})
    requests=[]; descriptors=[]
    for q,m in zip(questions,mappings):
        page=next(p for p in baseline['pages'] if p['pageNumber']==q['slideNumber'])
        lp=next(p for p in leaves['pages'] if p['pageNumber']==q['slideNumber'])
        prompt,sources,region=inputs_for('C',q,page,m,lp)
        requests.append((prompt,schema(q['questionAlias'])))
        descriptors.append((q,m,sources,region))
    started=time.perf_counter()
    outputs,metrics=run_llama_server_batch(args.llama_server,args.model,requests,threads=4,context_size=8192,max_tokens=384)
    records=[]
    for output,(q,m,sources,region) in zip(outputs,descriptors):
        issues=validate_result(output,q['questionAlias'],sources)
        if 'sensitive-text' in issues:
            output={k:redact_text(v)[0] if isinstance(v,str) else v for k,v in output.items()}
        records.append({'alias':q['questionAlias'],'page':q['slideNumber'],'question':redact_text(q['question'])[0],
            'regionAlias':region['alias'] if region else 'PAGE','regionType':region['label'] if region else None,
            'geometryStatus':m['mappingStatus'],'output':output,'issues':issues,'displayable':not issues,
            'referenceAgreement':output['intent'] in REFERENCE[q['questionAlias']]})
    elapsed=(time.perf_counter()-started)*1000+mapping_ms
    total=elapsed+sum(v['elapsedMs'] for v in source['preprocessing'].values())
    run={'method':'D','name':'사후 개선: 세부 영역 + 인접 OCR + 페이지 문맥','postHoc':True,'metrics':metrics,
         'reportStageMs':elapsed,'uncachedTotalMs':total,'scenarioCostKRWPer1000WorkerHour':round(total/3600,2),
         'referenceAgreementCount':sum(r['referenceAgreement'] for r in records),
         'outputGatePassCount':sum(r['displayable'] for r in records),
         'supportedAndGatePassCount':sum(r['displayable'] and r['output']['connection']=='supported' for r in records),
         'records':records,'regionGroups':aggregate(records),'reportStatus':'review-required' if all(r['displayable'] for r in records) else 'partial-diagnostic-only'}
    source['runs'].append(run)
    save(args.output/'results.json',source)
    protocol=json.loads((args.run/'protocol.json').read_text(encoding='utf-8'))
    protocol['postHocD']='Added after observing parent-image mapping failure. No holdout. Same model/prompt; C context plus leaf filter.'
    save(args.output/'protocol.json',protocol)
    print(json.dumps({k:run[k] for k in ('method','reportStageMs','referenceAgreementCount','outputGatePassCount')}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('run','questions','model','llama-server','output'):p.add_argument('--'+name,type=Path,required=True)
    main(p.parse_args())
