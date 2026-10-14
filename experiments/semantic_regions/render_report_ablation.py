"""Build reviewable experimental instructor reports and cost comparison offline."""
import argparse
import json
from pathlib import Path


def main(args):
    data=json.loads(args.results.read_text(encoding='utf-8'))
    if data.get('status')!='complete' or not {'A','B','C'} <= {r['method'] for r in data['runs']}:
        raise ValueError('All initial experiment runs must finish before rendering')
    protocol=json.loads(args.results.with_name('protocol.json').read_text(encoding='utf-8'))
    data['protocol']=protocol
    html=Path(__file__).with_name('report_ablation.html').read_text(encoding='utf-8')
    encoded=json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'index.html').write_text(html.replace('__DATA__',encoded),encoding='utf-8')
    lines=['# ClassPin OCR·영역·PIN 리포트 실험', '',
        '15페이지·17 PIN, 동일 Qwen3-4B Q4 모델 / 프롬프트 / 코드 검증. 후보별 1회 실행.',
        'A=전체 페이지 OCR, B=해당 영역 OCR, C=영역 OCR+전체 페이지 OCR. D가 있으면 큰 부모 그림 제외·동일 행 인접 OCR을 추가한 사후 개선 실험이며 별도 정답셋 검증이 아니다.', '',
        '| 후보 | 전체 처리 초 | 캐시 후 분석 초 | LLM peak RSS MiB | 임시 의도 라벨 일치 | 출력 검사 통과 | 근거 연결+검사 통과 | 비용 시나리오 원/건 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|']
    for r in data['runs']:
        lines.append(f"| {r['method']} | {r['uncachedTotalMs']/1000:.1f} | {r['reportStageMs']/1000:.1f} | {r['metrics']['peakProcessTreeRssMb']:.1f} | {r['referenceAgreementCount']}/17 | {r['outputGatePassCount']}/17 | {r['supportedAndGatePassCount']}/17 | {r['scenarioCostKRWPer1000WorkerHour']:.2f} |")
    lines += ['', '## 해석 제한', '',
        '- 비용은 같은 처리 성능을 가진 worker 1시간=1,000원이라는 가정. 실제 업체 견적/청구액/전력 측정이 아니다.',
        '- API 사용료는 0원. 서버·전기·저장·유휴 시간·네트워크·운영 인건비가 0원이라는 뜻은 아니다.',
        '- 임시 질문 의도 라벨은 실험 작성자가 사전 작성한 복수 허용 라벨이며 독립 전문가 정답이 아니다.',
        '- 원문 인용 검사 통과는 의미 정확도가 아니다. OCR 오류·잘못된 인과관계는 남을 수 있다.',
        '- 각 방법 1회 실행이다. 반복 실행 분산/p95/동시 사용자 부하/다른 PDF에 대한 일반화는 미측정.',
        '- 강사 리포트는 검토용 초안. 영역·의도별 묶음은 의미가 같은 질문으로 확정된 패턴이 아니다.',
        '- 지원 근거/출력 검증에 실패한 항목은 정상 리포트에서 제외하고 진단 영역에 보존한다. 일부 실패가 있으면 전체를 부분 진단으로 표시한다.',
        '', '## 상용화 가능성', '',
        '- 모든 후보는 동일한 Apache-2.0 모델/코드 계열을 사용한다. 라이선스 조건 준수 하에 상용 후보로 검토 가능.',
        '- 개인정보 비식별화, 소유권/RLS, 비평 모델, 오답/보류 정책, 정답셋 검증이 완료되기 전에는 운영 출시 불가.',
        '- 다음 평가: 강사 2인 독립 라벨, 다양한 PDF와 PIN 100개 이상, 의미 관계/개선안의 근거 정확도, 캐시·동시 작업 부하.',
        '', '## 출처', '',
        '- https://github.com/tesseract-ocr/tesseract',
        '- https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors',
        '- https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507',
        '', '## 후보별 강사 리포트 (미검증 초안)', '']
    for r in data['runs']:
        lines += [f"### {r['method']}: {r['name']}", '', f"상태: {r['reportStatus']}", '']
        for row in r['records']:
            out=row['output']
            lines += [f"#### {row['alias']} · {row['page']}페이지 / {row['regionAlias']}", '',
                f"질문: {row['question']}", f"분류: {out['intent']} / 연결: {out['connection']}"]
            if row['displayable']:
                lines += [f"대상: {out['target']}", f"해석: {out['analysis']}", f"강사 제안: {out['action']}",f"원문 근거: {out['quote']}"]
            else:
                lines += [f"출력 검사 실패로 정상 리포트 제외: {', '.join(row['issues'])}"]
            lines.append('')
    (args.output/'comparison.md').write_text('\n\n'.join(lines),encoding='utf-8')
    print(args.output.resolve())


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--results',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    main(p.parse_args())
