"""Offline dashboard for model substitutions (not pipeline ablations)."""
import argparse
import json
import shutil
from pathlib import Path


def main(args):
    root=args.run
    protocol=json.loads((root/'protocol.json').read_text(encoding='utf-8'))
    stages={name:json.loads((root/name/'result.json').read_text(encoding='utf-8'))
            for name in ('tesseract','easyocr','paddleocr','ppv3','pps','florence')}
    runs=[]
    for ident,ocr,layout,llm in protocol['combinations']:
        path=root/(ident+'.json')
        run=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'id':ident,'ocr':ocr,'layout':layout,'llm':llm,'status':'pending'}
        if run['status']=='complete' and 'pipelineMs' not in run:run['status']='finalizing'
        if run['status']!='complete':run.pop('records',None)
        runs.append(run)
    data={'protocol':protocol,'stages':stages,'runs':runs,
          'status':'complete-with-screening' if all(r['status'] in {'complete','screened-out'} for r in runs) else 'partial'}
    notice=root/'quality-notice.json'
    if notice.exists():
        data['qualityNotice']=json.loads(notice.read_text(encoding='utf-8'))
        for key in data['qualityNotice']['invalidStages']:
            stages[key]['status']='invalid-input';stages[key].pop('evaluation',None)
        for run in runs:
            if run['id'] in data['qualityNotice']['invalidRuns']:
                run['status']='invalid-input';run.pop('records',None)
    data['reviewRubric']=json.loads(Path(__file__).with_name('fixtures').joinpath('model_benchmark_pin_review.json').read_text(encoding='utf-8'))
    review=root/'case-review.json'
    if review.exists():
        data['caseReview']=json.loads(review.read_text(encoding='utf-8'))
        valid={r['id'] for r in runs if r['status']=='complete'}
        data['caseReview']['runs']=[r for r in data['caseReview']['runs'] if r['id'] in valid]
    inventory=root/'inventory.json'
    if inventory.exists():data['inventory']=json.loads(inventory.read_text(encoding='utf-8'))
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'reports.json').write_text(json.dumps({'runs':[r for r in runs if r['status']=='complete'],'caseReview':data.get('caseReview',{}),'stages':{k:{'processMs':v.get('processMs'),'evaluation':v.get('evaluation')} for k,v in stages.items()}},ensure_ascii=False),encoding='utf-8')
    for name,stage in data['stages'].items():
        folder=args.output/name;folder.mkdir(exist_ok=True)
        for page in stage['pages']:
            filename=f"page-{page['pageNumber']:02d}.jpg"
            source=root/name/filename
            if source.is_file():shutil.copyfile(source,folder/filename)
    template=Path(__file__).with_name('model_benchmark.html').read_text(encoding='utf-8')
    safe=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    html=template.replace('__DATA__',safe).replace('</body>','<script src="visuals.js"></script></body>')
    (args.output/'index.html').write_text(html,encoding='utf-8')
    shutil.copyfile(Path(__file__).with_name('model_benchmark_visuals.js'),args.output/'visuals.js')
    lines=['# 고정 파이프라인 모델 비교','', 'OCR + 영역 + 페이지 문맥 + PIN 리포트. 모델 하나씩 교체. 15페이지·17 PIN, 각 후보 1회.','',
        '| 조합 | OCR | 영역 | LLM | 전체 초 | LLM 초 | 출력 검사 | 의도 임시 라벨 | 가정 원/건 |',
        '|---|---|---|---|---:|---:|---:|---:|---:|']
    for r in data['runs']:
        if r['status']!='complete':lines.append(f"| {r['id']} | {r['ocr']} | {r['layout']} | {r['llm']} | {r['status']} | — | — | — | — |");continue
        lines.append(f"| {r['id']} | {r['ocr']} | {r['layout']} | {r['llm']} | {r['pipelineMs']/1000:.1f} | {r['reportStageMs']/1000:.1f} | {r['outputGatePassCount']}/17 | {r['referenceAgreementCount']}/17 | {r['scenarioCostKRW']:.1f} |")
    lines += ['','## 단계별 품질','']
    for name,s in data['stages'].items():
        if s['status']!='complete':lines.append(f"- {name}: {s['status']} ({len(s['pages'])}/15페이지)");continue
        e=s['evaluation']
        metric=f"24 ROI CER {e['cer']*100:.1f}%, 숫자 {e['numericExact']}/{e['numericCount']}" if s['stage']=='ocr' else f"부분 영역 회수 {e['matched']}/{e['count']} (IoU≥0.5)"
        lines.append(f"- {name}: {s['processMs']/1000:.1f}초, peak RSS {s['peakRssMiB']:.0f} MiB, {metric}")
    lines += ['','## 해석 제한','',
        '- PP-DocLayout-S와 Florence는 영역 단계 15페이지를 완료했지만 필수 표 구분 요구를 충족하지 못해 후속 리포트는 사후 선별 제외했다. 리포트는 5개 조합을 비교한다.',
        '- PIN 좌표는 영역 매핑에 쓰지만 LLM에 직접 전달하지 않는다. Q009/Q010이 같은 큰 영역으로 매핑되면 두 입력은 동일하므로, 그 혼동을 LLM 자체의 공간 추론 정확도라고 해석하지 않는다.',
        '- CER는 3페이지 24개 ROI의 에이전트 작성 정답에 대한 측정이며 전체 자료 정확도가 아니다. 공백 제거 NFC 정규화. 숫자는 완전 일치.',
        '- 영역 회수율은 8개 부분 주석 기준이다. 미주석 영역이 있으므로 precision/mAP 미산출. 매핑률은 정답률 아님.',
        '- 자동 출력 검사는 형식·원문 인용·민감정보를 확인하며 의미 정확도를 보장하지 않는다. 모든 리포트는 미검증 초안.',
        '- 처리 시간은 같은 비식별화 이미지에서 모델 로딩/추론/진단 파일 출력까지. PDF 렌더링·업로드·비식별화 생성·DB 저장·설치·다운로드 제외.',
        '- 비용은 동일 성능 worker 1000원/시간 가정의 활성 시간 환산. 실제 청구/전력/유휴/운영 비용 아님. 외부 API 이용료0.',
        '- CPU 4스레드, 모델별 1회. 프레임워크/양자화/학습버전/채팅 템플릿 차이를 포함하는 배포 후보 비교다. 분산/p95/GPU/동시성 미측정.',
        '- 사용 후보 Apache-2.0 또는 MIT 조건 검토 대상. 라이선스 허용은 상용 출시 품질이나 법적 최종 승인을 의미하지 않는다.',
        '', '모델 버전·해시·원문 결과는 실행 폴더의 protocol.json 및 개별 JSON에 보존.']
    (args.output/'comparison.md').write_text('\n'.join(lines),encoding='utf-8')
    print(args.output.resolve())


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run',type=Path,default=Path('output/model-benchmark-cpu-v1'))
    p.add_argument('--output',type=Path,default=Path('output/report-ablation-view/model-benchmark'))
    main(p.parse_args())
