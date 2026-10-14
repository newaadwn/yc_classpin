"""Experimental duplicate removal and conservative overlap consolidation.

Runs only on saved PDF extraction; no product or instructor data writes.
"""
import json
import sys
import time
from pathlib import Path

from soi_pdf_trial import save_report
import server

original_validate = server.validate_groups


def overlap(a, b):
    return min(a['x']+a['w'],b['x']+b['w']) > max(a['x'],b['x']) and min(a['y']+a['h'],b['y']+b['h']) > max(a['y'],b['y'])


def clean_elements(elements):
    result = []
    for element in elements:
        box = element['box']
        if any(max(abs(a-b) for a,b in zip(box, old['box'])) < .003 and element['text'].strip() == old['text'].strip() for old in result):
            continue
        item = dict(element, id=len(result))
        if box[3] < .12 and item['kind'] in ('paragraph_title','text'):
            item['kind'] = 'title'
        result.append(item)
    return result


def consolidate(groups, elements, limit=4):
    # Retain strict label/member checks, but conservatively union overlapping topics.
    if not isinstance(groups, list) or not 1 <= len(groups) <= limit:
        raise ValueError('INVALID_GROUP_COUNT')
    used = set()
    result = []
    for group in groups:
        item = original_validate([group], elements, limit)[0]
        if used.intersection(group['members']):
            raise ValueError('DUPLICATE_MEMBERS')
        used.update(group['members'])
        item['sourceNames'] = [item['name']]
        result.append(item)
    changed = True
    while changed:
        changed = False
        for i in range(len(result)):
            for j in range(i+1, len(result)):
                a,b = result[i],result[j]
                if not overlap(a,b):
                    continue
                x,y = min(a['x'],b['x']),min(a['y'],b['y'])
                right,bottom = max(a['x']+a['w'],b['x']+b['w']),max(a['y']+a['h'],b['y']+b['h'])
                names = list(dict.fromkeys(a['sourceNames']+b['sourceNames']))
                result[i] = dict(id=a['id'], x=x,y=y,w=right-x,h=bottom-y,name=' / '.join(names),meaning='겹침 방지를 위해 인접 주제를 병합한 후보 · 강사 검수 필요',text=a['text']+' '+b['text'],sourceNames=names,overlapMerged=True)
                result.pop(j)
                changed = True
                break
            if changed:
                break
    for i,item in enumerate(result):
        item['id'] = f'section-{i}'
    return result


def main():
    source = Path(sys.argv[1]).resolve()
    baseline = json.loads((source/'result.json').read_text('utf8'))
    assert baseline.get('complete'), 'Wait for the extraction trial to finish.'
    out = source / 'refined'
    out.mkdir(exist_ok=False)
    report = dict(baseline, pages=[], complete=False, pipeline='Paddle OCR/layout + duplicate removal + coarse Qwen grouping + conservative overlap union')
    server.validate_groups = consolidate
    for old in baseline['pages']:
        start = time.perf_counter()
        record = dict(old)
        record['baselineStatus'] = old['status']
        record['baselineSections'] = old['sections']
        record.pop('error',None)
        # Hard links reuse original PDF renders without altering them.
        (out/f'page-{old["page"]:02}.png').hardlink_to(source/f'page-{old["page"]:02}.png')
        elements = clean_elements(old.get('elements', []))
        record['removedDuplicateCount'] = len(old.get('elements', []))-len(elements)
        record['elements'] = elements
        record['elementCount'] = len(elements)
        try:
            if old['status'] == '의미 섹션 자동 초안' and len(old['sections']) <= 3 and record['removedDuplicateCount'] == 0:
                record['status'] = '기존 의미 섹션 유지 · 검수 필요'
            else:
                record['sections'] = server.semantic_elements(elements, {'granularity':'coarse','language':'ko'})
                record['status'] = '보정 의미 섹션 · 검수 필요'
            if any(s.get('overlapMerged') for s in record['sections']):
                record['status'] = '겹침 병합 후보 · 검수 필요'
        except Exception as error:
            record['status'] = '보정 실패 · 기존 결과 보존'
            record['error'] = type(error).__name__+': '+str(error).splitlines()[0][:220]
        record['elapsedSeconds'] = round(time.perf_counter()-start,2)
        report['pages'].append(record)
        save_report(out, report)
        print(f'REFINED {old["page"]}: {len(record["sections"])} sections, {record["elapsedSeconds"]}s',flush=True)
    report['complete'] = True
    save_report(out,report)


if __name__ == '__main__':
    main()
