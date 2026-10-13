from __future__ import annotations

import argparse
import html
import json
import shutil
from pathlib import Path
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import draw_overlay, require_empty_output
    from experiments.semantic_regions.ocr_redaction import redact_text
except ModuleNotFoundError:
    from extract_regions import draw_overlay, require_empty_output  # type: ignore[no-redef]
    from ocr_redaction import redact_text  # type: ignore[no-redef]


RELATION_LABELS = {
    "asks_clarification": "추가 설명 요청",
    "requests_evidence": "근거 요청",
    "challenges_assumption": "전제·타당성 이의",
    "suggests_improvement": "개선 제안",
    "confirms": "동의·확인",
    "unrelated": "위치와 무관",
}


def escape(value: Any) -> str:
    return html.escape(str(value), quote=True)


def confidence_label(value: Any) -> str:
    confidence = float(value or 0)
    if confidence >= 0.75:
        return "높음"
    if confidence >= 0.5:
        return "보통"
    return "검토 필요"


def render_html(run: dict[str, Any], questions: dict[str, Any]) -> str:
    artifact = run["artifact"]
    question_by_alias = {
        str(question.get("questionAlias")): question for question in questions.get("questions") or []
    }
    mappings = {str(mapping["questionAlias"]): mapping for mapping in run.get("pinMappings") or []}
    pin_cards = []
    for analysis in run.get("pinSemanticAnalyses") or []:
        question_alias = str(analysis["questionAlias"])
        question = question_by_alias.get(question_alias, {})
        redacted_question, _ = redact_text(str(question.get("question") or ""))
        mapping = mappings.get(question_alias, {})
        pin_cards.append(
            f"""
            <article class="pin-card">
              <div class="eyebrow">{escape(question_alias)} · {escape(analysis['regionAlias'])}</div>
              <h3>{escape(redacted_question)}</h3>
              <div class="pill">{escape(RELATION_LABELS.get(analysis['relation'], analysis['relation']))}</div>
              <p>{escape(analysis['analysis'])}</p>
              <div class="action"><strong>강사 권장 행동</strong><br>{escape(analysis['instructorAction'])}</div>
              <small>위치 매핑: {escape(mapping.get('mappingStatus', 'unknown'))} · 의미 신뢰도 {escape(confidence_label(analysis['confidence']))}</small>
            </article>
            """
        )

    region_rows = []
    for region in artifact["regions"]:
        concepts = ", ".join(region.get("concepts") or []) or "—"
        box = region["bboxNorm"]
        bbox = f"({box['x1']:.3f}, {box['y1']:.3f})–({box['x2']:.3f}, {box['y2']:.3f})"
        region_rows.append(
            f"""
            <tr>
              <td><strong>{escape(region['alias'])}</strong><br><span class="muted">{escape(region['type'])}</span></td>
              <td>{escape(region['summary'])}<br><span class="concepts">{escape(concepts)}</span></td>
              <td>{escape(confidence_label(region['confidence']))}<br><span class="muted">{float(region['confidence']):.2f}</span></td>
              <td class="bbox">{escape(bbox)}</td>
            </tr>
            """
        )

    warnings = run.get("semanticQualityWarnings") or []
    warning_items = "".join(
        f"<li>{escape(item['candidateAlias'])}: {escape(item['reason'])}</li>" for item in warnings
    ) or "<li>자동 품질 경고 없음</li>"
    metrics = run["metrics"]
    model = run["model"]
    return f"""<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ClassPin AI 강사 리포트 · {escape(run['slideAlias'])}</title>
  <style>
    :root{{--navy:#0c1730;--blue:#165dff;--sky:#eef4ff;--line:#dce5f3;--ink:#172033;--muted:#667085;--amber:#fff5d6}}
    *{{box-sizing:border-box}}body{{margin:0;font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:var(--ink);background:#f5f7fb}}
    header{{padding:42px max(24px,calc((100vw - 1180px)/2));background:linear-gradient(135deg,var(--navy),#16366e);color:white}}
    header .eyebrow{{color:#9ec1ff}}h1{{margin:8px 0 10px;font-size:34px}}h2{{margin:0 0 18px;font-size:23px}}h3{{margin:8px 0 12px}}
    header p{{max-width:820px;margin:0;color:#d8e5ff;line-height:1.7}}main{{max-width:1180px;margin:28px auto 70px;padding:0 24px}}
    .grid{{display:grid;grid-template-columns:1.45fr .85fr;gap:20px}}.card{{background:white;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 8px 28px rgba(28,46,78,.06)}}
    .slide{{width:100%;border-radius:12px;border:1px solid var(--line)}}.stats{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}}
    .stat{{padding:14px;border-radius:12px;background:var(--sky)}}.stat strong{{display:block;font-size:24px;color:var(--blue)}}
    .eyebrow{{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}}.summary{{font-size:18px;line-height:1.65}}
    .pin-card{{border:1px solid #bfd2ff;border-left:5px solid var(--blue);border-radius:14px;padding:18px;background:#fbfdff}}
    .pill{{display:inline-block;padding:6px 10px;border-radius:999px;background:#e8f0ff;color:#174ea6;font-size:13px;font-weight:800}}
    .pin-card p{{line-height:1.65}}.pin-card small{{color:var(--muted)}}.action{{background:#edf7ef;border-radius:10px;padding:13px;margin:14px 0;line-height:1.6}}
    table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{text-align:left;padding:13px 10px;border-bottom:1px solid var(--line);vertical-align:top}}th{{color:var(--muted);font-size:12px}}
    .concepts{{color:#315b9c;font-size:12px}}.muted{{color:var(--muted);font-size:12px}}.bbox{{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}}
    .notice{{background:var(--amber);border:1px solid #f1d37a}}ul{{line-height:1.7}}section{{margin-top:20px}}
    @media(max-width:850px){{.grid{{grid-template-columns:1fr}}.bbox{{display:none}}}}
  </style>
</head><body>
  <header><div class="eyebrow">ClassPin · AI Instructor Report Prototype</div><h1>{escape(run['slideAlias'])} 의미 영역 + PIN 분석</h1>
    <p>페이지 요소의 위치는 결정적 코드가 계산하고, 로컬 AI는 의미 설명과 질문 관계만 제안합니다. 아래 결과는 원본 서비스·Supabase와 분리된 로컬 평가 산출물입니다.</p></header>
  <main><div class="grid">
    <section class="card"><h2>의미 영역 오버레이</h2><img class="slide" src="assets/slide-008.semantic-overlay.jpg" alt="슬라이드 의미 영역 오버레이"></section>
    <section class="card"><div class="eyebrow">페이지 핵심 해석</div><p class="summary">{escape(run['semanticEnrichment']['slideSummary'])}</p>
      <p><strong>핵심 개념</strong><br>{escape(', '.join(run['semanticEnrichment']['keyConcepts']))}</p>
      <div class="stats"><div class="stat"><strong>{run['inputElementCount']}</strong>OCR 요소</div><div class="stat"><strong>{run['semanticRegionCount']}</strong>의미 영역</div><div class="stat"><strong>{run['ignoredElementCount']}</strong>잡음 분리</div><div class="stat"><strong>{len(run.get('pinSemanticAnalyses') or [])}</strong>PIN 의미 분석</div></div>
    </section></div>
    <section class="card"><h2>PIN에서 읽힌 강사 인사이트</h2>{''.join(pin_cards) or '<p>분석된 PIN이 없습니다.</p>'}</section>
    <section class="card"><h2>페이지 요소별 의미</h2><table><thead><tr><th>영역</th><th>AI 의미</th><th>신뢰도</th><th class="bbox">정규화 위치</th></tr></thead><tbody>{''.join(region_rows)}</tbody></table></section>
    <section class="card notice"><h2>자동 품질 게이트와 현재 한계</h2><ul>{warning_items}</ul><p>텍스트·배치 기반으로는 이미지 안의 실제 장면을 완전히 이해할 수 없습니다. 이미지 중심 영역은 저신뢰로 표시했습니다. 운영 버전은 저신뢰 영역만 선택적으로 비전 모델에 보내는 2단계 경로가 필요합니다.</p></section>
    <section class="card"><h2>실행 비용</h2><p>{escape(model['name'])} · {escape(model['license'])} · 총 {float(metrics['elapsedMs'])/1000:.1f}초 · 최대 프로세스 메모리 {float(metrics['peakProcessTreeRssMb'])/1024:.2f}GB · 외부 API 비용 0원</p></section>
  </main></body></html>"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a local instructor report from a semantic run bundle.")
    parser.add_argument("run", type=Path)
    parser.add_argument("slide_image", type=Path)
    parser.add_argument("questions", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run = json.loads(args.run.read_text(encoding="utf-8"))
    questions = json.loads(args.questions.read_text(encoding="utf-8"))
    output = args.output.resolve()
    require_empty_output(output)
    assets = output / "assets"
    assets.mkdir(parents=True)
    source = args.slide_image.resolve()
    redacted_target = assets / "slide-008.redacted.jpg"
    overlay_target = assets / "slide-008.semantic-overlay.jpg"
    shutil.copyfile(source, redacted_target)
    draw_overlay(redacted_target, overlay_target, run["artifact"]["regions"])
    (output / "report-data.json").write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "index.html").write_text(render_html(run, questions), encoding="utf-8")
    print(json.dumps({"output": str(output), "index": str(output / "index.html")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
