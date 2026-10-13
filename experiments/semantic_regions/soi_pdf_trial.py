"""Isolated SOI PDF trial. Never changes instructor/browser/DB state."""
import hashlib
import html
import json
import sys
import time
from pathlib import Path

import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'services/local-sections'))
from server import extract_image_elements, semantic_elements, layout_sections


def save_report(out, report):
    (out / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    cards = []
    colors = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0891b2']
    for page in report['pages']:
        overlays, items = [], []
        for i, section in enumerate(page.get('sections', [])):
            color = colors[i % len(colors)]
            label = html.escape(section['name'])
            overlays.append(f'<div class="box" style="left:{section["x"]*100}%;top:{section["y"]*100}%;width:{section["w"]*100}%;height:{section["h"]*100}%;border-color:{color};background:{color}18"><span style="background:{color}">{i+1}. {label}</span></div>')
            items.append(f'<li><b>{label}</b> {html.escape(section.get("meaning", ""))}</li>')
        cards.append(f'<article><h2>{page["page"]}페이지 · {html.escape(page["status"])}</h2><p>{page.get("elementCount",0)}개 추출 요소 · {len(page.get("sections", []))}개 영역 · {page.get("elapsedSeconds",0)}초</p><div class="slide"><img src="page-{page["page"]:02}.png">{"".join(overlays)}</div><ul>{"".join(items)}</ul><p>{html.escape(page.get("error", ""))}</p></article>')
    total = sum(len(p.get('sections', [])) for p in report['pages'])
    info = f'{len(report["pages"])}/{report["pageCount"]}페이지 · {total}개 표시 영역 · 자동 초안 / 강사 미확정'
    doc = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOI PDF 영역 분리 실험</title><style>body{font:16px system-ui;margin:32px;background:#edf2f7;color:#152238}main{max-width:1300px;margin:auto}article{background:white;padding:24px;margin:24px 0;border-radius:14px}.slide{position:relative}.slide img{width:100%;display:block}.box{position:absolute;box-sizing:border-box;border:2px solid;pointer-events:none}.box span{color:white;font-size:12px;padding:3px;display:inline-block;max-width:95%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}li{margin:8px}p{color:#536179}</style><main><h1>SOI PDF · PaddleOCR 영역 분리 실험</h1><h3>' + info + '</h3><p>' + html.escape(report['pipeline']) + '</p><p>자동 초안이며 강사 검수 전입니다. 실패·여백 후보·겹침 병합 여부를 페이지별로 표시합니다. 기존 수동 영역은 변경하지 않았습니다.</p>' + ''.join(cards) + '</main></html>'
    (out / 'index.html').write_text(doc, encoding='utf8')


def main():
    source = ROOT.parent / 'SOI_slides_reconstructed.pdf'
    out = ROOT / 'output' / ('soi-paddle-trial-' + time.strftime('%Y%m%d-%H%M%S'))
    out.mkdir(parents=True, exist_ok=False)
    document = pdfium.PdfDocument(str(source))
    report = dict(source=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest(), pageCount=len(document), pipeline='PP-OCRv5 Korean + PP-DocLayoutV3 + Qwen3-4B', confirmed=False, pages=[])
    print(f'OUTPUT={out}', flush=True)
    for index in range(len(document)):
        started = time.perf_counter()
        page = document[index]
        image = page.render(scale=1600 / page.get_width()).to_pil().convert('RGB')
        file = out / f'page-{index+1:02}.png'
        image.save(file)
        record = dict(page=index+1, status='분석 중', sections=[])
        report['pages'].append(record)
        save_report(out, report)
        try:
            extraction = extract_image_elements(file.read_bytes())
            record['elements'] = extraction['elements']
            record['elementCount'] = len(extraction['elements'])
            record['extractionSeconds'] = round(time.perf_counter()-started, 2)
            print(f'PAGE {index+1}: extracted {record["elementCount"]}, semantic grouping...', flush=True)
            try:
                record['sections'] = semantic_elements(extraction['elements'], {'granularity':'normal','language':'ko'})
                record['status'] = '의미 섹션 자동 초안'
            except Exception as error:
                record['status'] = '여백 기반 후보 · 의미 분석 실패'
                record['error'] = type(error).__name__ + ': ' + str(error).splitlines()[0][:220]
                record['sections'] = layout_sections(extraction['elements'], {'granularity':'normal'})
        except Exception as error:
            record['status'] = '추출 실패'
            record['error'] = type(error).__name__ + ': ' + str(error).splitlines()[0][:220]
        record['elapsedSeconds'] = round(time.perf_counter()-started, 2)
        save_report(out, report)
        print(f'PAGE {index+1}: {record["status"]}, {len(record["sections"])} sections, {record["elapsedSeconds"]}s', flush=True)
        page.close()
    document.close()
    report['complete'] = True
    save_report(out, report)
    print('COMPLETE', flush=True)


if __name__ == '__main__':
    main()
