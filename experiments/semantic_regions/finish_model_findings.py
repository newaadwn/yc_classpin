"""Assemble measured findings and explicitly authored diagnostic review."""
import json
from pathlib import Path

ROOT=Path('output/model-benchmark-final-v1')

def main():
    data=json.loads((ROOT/'results.json').read_text(encoding='utf-8'))
    complete=[r for r in data['runs'] if r['status']=='complete']
    assert len(complete)==5 and all(len(r['records'])==17 for r in complete)
    assert len({r['inputHash'] for r in complete if r['id'] in {'base','llm-small','llm-granite'}})==1
    review=json.loads(Path('output/model-benchmark-cpu-v1/case-review.json').read_text(encoding='utf-8'))
    review['runs']=[r for r in review['runs'] if r['id']!='ocr-easy']
    review['runs'].append({'id':'llm-granite','targetCorrect':0,'recommendationGrounded':0,'cases':[
        {'alias':'Q009','targetCorrect':False,'recommendationGrounded':False,'note':'공감 90%를 특정하지 못하고 80명·2주 유지 등을 측정 방법으로 단정.'},
        {'alias':'Q010','targetCorrect':False,'recommendationGrounded':False,'note':'사용 의사 74%를 특정하지 않고 지표를 나열하며 문장이 불완전함.'},
        {'alias':'Q011','targetCorrect':False,'recommendationGrounded':False,'note':'감정 인식 하나만 명명. 비교 대상 두 기술을 구분하지 않고 추가 설명이라는 일반 문구만 제안.'},
        {'alias':'Q012','targetCorrect':False,'recommendationGrounded':False,'note':'Deepgram·Gemini를 특정하지 않고 학습 효율 향상을 선정 이유로 근거 없이 주장.'}
    ]})
    easy=ROOT/'easy-case-review.json'
    if easy.exists():review['runs'].append(json.loads(easy.read_text(encoding='utf-8')))
    for r in review['runs']:
        assert r['targetCorrect']==sum(x['targetCorrect'] for x in r['cases'])
        assert r['recommendationGrounded']==sum(x['recommendationGrounded'] for x in r['cases'])
    (ROOT/'case-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['# ClassPin 모델 후보 비교 — 실측 결론','',
        '방법은 OCR → 문서 영역 → PIN 매핑 → 영역·페이지 텍스트 문맥 → PIN 분석/강사 리포트로 고정했다. 기준 조합에서 모델 하나씩 교체했다. 15페이지·17 PIN, CPU 4스레드, 각 1회다.',
        '', '## 결론','',
        '- 다음 개발의 기준 후보는 한국어 PP-OCRv5 mobile + PP-DocLayoutV3 + Qwen3-4B-Instruct-2507이다. 이번 자료에서의 후보 선정이며 상용 출시 승인이나 보편적 최고 모델 판정은 아니다.',
        '- OCR 표본은 PP-OCRv5가 가장 정확했다. EasyOCR는 더 빠른 대안이다. Tesseract는 가장 빠르고 가볍지만 이 자료의 작은 한글·숫자 오독이 컸다.',
        '- 영역 모델 V3는 부분 정답 7/8, S는 2/8, Florence dense caption은 0/8이다. 후자 둘은 표 분리 요구를 충족하지 못해 리포트 단계에서 사후 선별 제외했다. 세 모델 모두 15페이지 영역 추론은 완료했다.',
        '- 동일 Tesseract+V3 입력에서 의도 임시 라벨 일치는 Qwen4B 16/17, Granite2B 8/17, Qwen1.7B 2/17이었다. 작은 모델의 시간 절감과 결과 품질을 함께 봐야 한다.',
        '- 어떤 조합도 현재 그대로 강사에게 자동 확정 리포트를 제공하기에는 부족하다. 올바른 원문 인용이 있어도 엉뚱한 지표 설명이나 근거 없는 선정 이유가 생성됐다.',
        '', '## 전체 처리 및 비용 가정','',
        '| 조합 | 합산 시간(초) | LLM 시간(초) | LLM peak MiB | 출력 검사 통과 | 의도 라벨 일치 | 가정 원/건 |',
        '|---|---:|---:|---:|---:|---:|---:|']
    for r in complete:
        lines.append(f"| {r['id']} | {r['pipelineMs']/1000:.1f} | {r['reportStageMs']/1000:.1f} | {r['peakRssMiB']:.0f} | {r['outputGatePassCount']}/17 | {r['referenceAgreementCount']}/17 | {r['scenarioCostKRW']:.1f} |")
    lines += ['', '시간은 단계별 실측값의 합이다. 같은 성능 worker 1,000원/시간을 가정한 활성 시간 환산이며 실제 서버 견적/전기요금이 아니다. 외부 추론 API 이용료는 0원이지만 저장·트래픽·유휴·운영 비용은 별도다. PDF 렌더링·업로드·비식별화 생성·모델 다운로드도 시간에서 제외했다.',
        '', '## 상용화 판단','',
        '사용 후보는 Apache-2.0/MIT 계열이지만 코드·가중치·의존성의 고지와 재배포 조건을 실제 배포물 기준으로 확인해야 한다. 라이선스 허용과 제품 품질은 별개다. 원본 서비스와 DB는 변경하지 않았고 비식별화 이미지의 로컬 추론만 수행했다.',
        '', '## 가장 중요한 다음 실험','',
        '모델만 바꿔도 해결되지 않는 입력 정보 손실이 발견됐다. 12페이지 Q009(공감 90%)와 Q010(사용 의사 74%)은 같은 큰 영역에 연결되고, LLM에는 PIN 좌표가 직접 전달되지 않아 사실상 같은 입력이다. 이번 실패를 LLM 자체의 공간 추론 능력 점수로 해석하면 안 된다.',
        '', '다음에는 모든 후보에 공통으로 세부 영역/수치-라벨 묶음, PIN과 후보 영역의 거리·좌표, 페이지 문맥을 제공한 뒤 재비교해야 한다. 현재는 문서 bounding box 검출이며 픽셀 세그멘테이션이 아니고, LLM은 그림이나 표의 체크 표시를 직접 보지 않는다. 시각 입력을 받는 후보 비교는 별도 후속 실험이다.',
        '', '## 측정의 한계와 재현성','',
        '- OCR CER는 3페이지의 24개 ROI, 숫자 12개 기준이다. PP-OCRv5의 표본 오류 0%는 전체 PDF 정확도 100%를 뜻하지 않는다.',
        '- 영역은 8개 부분 주석, 의미 진단은 4사례, 의도는 에이전트 임시 라벨이다. 독립 블라인드 정답이 아니며 반복 분산/p95/GPU/동시 요청/전력은 미측정이다.',
        '- 출력 검사는 형식·정확 인용 등의 통과 수이지 의미 정확도가 아니다. 수동 진단에서도 안전한 개선 제안이 부족했다.',
        '- EasyOCR의 RGB/BGR 어댑터 오류를 수정하고 OCR 및 후속 리포트 모두 재실행했다. 이전 잘못된 입력 결과는 최종 비교에서 제외했다.',
        '- protocol.json, inventory.json, 개별 결과 JSON에 버전·해시·측정값을 보존했다. 문맥 모델 3종의 입력 해시 일치를 검증했다.',
        '', '[비교 화면](http://127.0.0.1:8767/model-benchmark/)']
    (ROOT/'findings.md').write_text('\n'.join(lines),encoding='utf-8')
    print('Five complete pipelines, input hashes and review counts verified.')

if __name__=='__main__':main()
