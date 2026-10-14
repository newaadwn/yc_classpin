from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import require_empty_output
    from experiments.semantic_regions.ocr_redaction import redact_text
except ModuleNotFoundError:
    from extract_regions import require_empty_output  # type: ignore[no-redef]
    from ocr_redaction import redact_text  # type: ignore[no-redef]


REPORT_VERSION = "instructor-report-preview.v1"
EVIDENCE_SLIDES = (2, 3, 5, 8, 11, 12)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_questions(document: Any) -> list[dict[str, Any]]:
    questions = document.get("questions") if isinstance(document, dict) else document
    if not isinstance(questions, list):
        raise ValueError("Question snapshot must contain a questions array.")
    normalized: list[dict[str, Any]] = []
    aliases: set[str] = set()
    for index, item in enumerate(questions):
        if not isinstance(item, dict):
            raise ValueError(f"questions[{index}] must be an object.")
        alias = item.get("questionAlias")
        slide_number = item.get("slideNumber")
        if not isinstance(alias, str) or not alias.startswith("Q") or alias in aliases:
            raise ValueError(f"questions[{index}] has an invalid or duplicate alias.")
        if isinstance(slide_number, bool) or not isinstance(slide_number, int) or slide_number < 1:
            raise ValueError(f"questions[{index}] has an invalid slideNumber.")
        question, _ = redact_text(str(item.get("question") or ""))
        category, _ = redact_text(str(item.get("category") or "미분류"))
        status = str(item.get("status") or "unknown")
        normalized.append(
            {
                "alias": alias,
                "slide": slide_number,
                "question": question,
                "category": category,
                "status": status,
                "kind": str(item.get("kind") or "none"),
                "coords": item.get("coords") if isinstance(item.get("coords"), dict) else None,
            }
        )
        aliases.add(alias)
    return sorted(normalized, key=lambda item: item["alias"])


def build_claims(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aliases = {question["alias"] for question in questions}
    claims = [
        {
            "id": "C001",
            "title": "Slide 3과 5를 먼저 검토하세요",
            "body": "두 슬라이드에 질문이 각각 3개로 가장 많이 모였습니다. 질문 수는 이해도 자체가 아니라 강사가 먼저 확인할 위치를 정하는 신호입니다.",
            "level": "제한적",
            "slideRefs": [3, 5],
            "questionRefs": ["Q004", "Q006", "Q008", "Q014", "Q015", "Q016"],
            "metricRefs": ["slide_question_count"],
        },
        {
            "id": "C002",
            "title": "판단 근거와 측정 방식을 명시하세요",
            "body": "성장 판단, 표본, 선택 이유, 측정 방식에 관한 질문이 여러 슬라이드에 있습니다. 각 수치 옆에 출처·대상·기간·선정 기준을 함께 보여주는 것이 좋습니다.",
            "level": "제한적",
            "slideRefs": [2, 3, 5, 11, 12],
            "questionRefs": ["Q004", "Q005", "Q009", "Q010", "Q011", "Q012", "Q014", "Q015", "Q016", "Q017"],
            "metricRefs": ["category_count"],
        },
        {
            "id": "C003",
            "title": "Slide 8에는 실제 프로토타입 구분이 필요합니다",
            "body": "한 질문이 AI 생성 이미지보다 직접 만든 프로토타입이 낫지 않은지 묻고 있습니다. 현재 이미지를 개념 예시로 명시하거나 실제 검증 가능한 프로토타입 화면을 추가해 오해를 줄일 수 있습니다.",
            "level": "제한적",
            "slideRefs": [8],
            "questionRefs": ["Q002"],
            "metricRefs": [],
            "regionRef": "S008:R003",
        },
        {
            "id": "C004",
            "title": "미답변 질문 17개를 강의 전 확인하세요",
            "body": "snapshot의 질문 17개가 모두 미답변 상태입니다. 리포트는 질문 상태를 자동으로 바꾸지 않으며, 강사가 답변 또는 강의자료 보강 여부를 결정해야 합니다.",
            "level": "충분",
            "slideRefs": sorted({question["slide"] for question in questions}),
            "questionRefs": [question["alias"] for question in questions],
            "metricRefs": ["unanswered_count"],
        },
    ]
    for claim in claims:
        missing = set(claim["questionRefs"]) - aliases
        if missing:
            raise ValueError(f"{claim['id']} references missing questions: {sorted(missing)}")
    return claims


def build_report_data(questions: list[dict[str, Any]]) -> dict[str, Any]:
    by_slide = Counter(question["slide"] for question in questions)
    by_category = Counter(question["category"] for question in questions)
    unanswered = sum(question["status"] == "unanswered" for question in questions)
    return {
        "schemaVersion": REPORT_VERSION,
        "title": "SOi 강의 개선 리포트",
        "material": "뉴던 PPT-압축됨",
        "generatedAt": "2026-09-06",
        "evidenceLevel": "제한적",
        "scope": {
            "slides": 15,
            "questions": len(questions),
            "questionSlides": len(by_slide),
            "unanswered": unanswered,
        },
        "slideCounts": [{"slide": slide, "count": by_slide.get(slide, 0)} for slide in range(1, 16)],
        "categoryCounts": [
            {"category": category, "count": count}
            for category, count in sorted(by_category.items(), key=lambda item: (-item[1], item[0]))
        ],
        "claims": build_claims(questions),
        "questions": questions,
        "limitations": [
            "현재 미리보기는 고정된 질문 snapshot과 검증된 코드 metric을 사용합니다.",
            "15장 전체의 멀티모달 의미 영역 분석은 아직 완료되지 않았습니다.",
            "질문이 없는 영역을 이해된 영역으로 판단하지 않습니다.",
            "Slide 8 이외의 영역 연결은 아직 강사용 근거로 확정하지 않았습니다.",
        ],
    }


def copy_evidence_images(
    baseline_manifest: dict[str, Any],
    baseline_dir: Path,
    semantic_dir: Path,
    output_dir: Path,
) -> dict[str, str]:
    if baseline_manifest.get("safeForExternalAi") is not True:
        raise ValueError("Only a redacted, externally safe baseline may be rendered.")
    pages = {page.get("pageNumber"): page for page in baseline_manifest.get("pages") or []}
    assets = output_dir / "assets"
    assets.mkdir()
    image_map: dict[str, str] = {}
    for slide in EVIDENCE_SLIDES:
        page = pages.get(slide)
        if not isinstance(page, dict):
            raise ValueError(f"Slide {slide} is missing from the baseline manifest.")
        source = baseline_dir / str(page.get("renderedImage") or "")
        if slide == 8:
            semantic_overlay = semantic_dir / "slide-008.semantic.overlay.jpg"
            if semantic_overlay.is_file():
                source = semantic_overlay
        if not source.is_file():
            raise FileNotFoundError(f"Evidence image was not found: {source}")
        target_name = f"slide-{slide:03d}.jpg"
        shutil.copyfile(source, assets / target_name)
        image_map[str(slide)] = f"assets/{target_name}"
    return image_map


def render_html(report: dict[str, Any], image_map: dict[str, str]) -> str:
    payload = json.dumps({**report, "images": image_map}, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClassPin · SOi 강의 개선 리포트</title>
  <style>
    :root {{ color-scheme: light; --brand:#2867e8; --brand-soft:#eff6ff; --ink:#171d26; --muted:#5e6978; --line:#e5eaf0; --surface:#fff; --page:#f8fafc; --warn:#d97706; --warn-bg:#fff7ed; --success:#0e9f6e; --error:#e5484d; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:var(--page); color:var(--ink); font-family:Pretendard,"Malgun Gothic","Segoe UI",sans-serif; line-height:1.55; }}
    button {{ font:inherit; }}
    button:focus-visible, summary:focus-visible {{ outline:3px solid rgba(52,120,246,.25); outline-offset:2px; }}
    .shell {{ max-width:1180px; margin:auto; padding:36px 28px 80px; }}
    .eyebrow {{ color:var(--brand); font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 4px; font-size:32px; line-height:1.3; }}
    h2 {{ margin:0 0 18px; font-size:22px; }}
    h3 {{ margin:0 0 8px; font-size:18px; }}
    p {{ margin:0; }}
    .muted {{ color:var(--muted); }}
    .topline {{ display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }}
    .badge {{ display:inline-flex; align-items:center; gap:7px; min-height:28px; padding:3px 11px; border-radius:999px; font-size:13px; font-weight:700; color:var(--warn); background:var(--warn-bg); }}
    .badge::before {{ content:""; width:7px; height:7px; border-radius:50%; background:currentColor; }}
    .tabs {{ display:inline-flex; padding:4px; margin:28px 0; border:1px solid var(--line); border-radius:12px; background:var(--surface); }}
    .tab {{ min-width:148px; min-height:40px; padding:0 16px; border:0; border-radius:8px; color:var(--muted); background:transparent; cursor:pointer; font-weight:700; }}
    .tab[aria-pressed="true"] {{ color:#fff; background:var(--brand); }}
    .view[hidden] {{ display:none; }}
    .metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:32px; }}
    .metric, .card, .panel {{ background:var(--surface); border:1px solid var(--line); border-radius:16px; }}
    .metric {{ padding:20px; }}
    .metric strong {{ display:block; font-size:28px; line-height:1.2; font-variant-numeric:tabular-nums; }}
    .metric span {{ display:block; margin-top:6px; color:var(--muted); font-size:13px; }}
    .section {{ margin-top:34px; }}
    .claim-grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }}
    .card {{ padding:24px; display:flex; flex-direction:column; gap:14px; }}
    .card-top {{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }}
    .level {{ flex:none; padding:3px 9px; border-radius:999px; color:var(--warn); background:var(--warn-bg); font-size:12px; font-weight:700; }}
    .level.good {{ color:var(--success); background:#ecfdf5; }}
    .refs {{ color:var(--muted); font-size:12px; }}
    .evidence-button {{ align-self:flex-start; min-height:40px; padding:0 16px; border:1px solid #d1d8e0; border-radius:10px; color:#2054c8; background:#fff; cursor:pointer; font-weight:700; }}
    .evidence-button:hover {{ background:var(--brand-soft); }}
    .chart {{ display:grid; grid-template-columns:repeat(15,1fr); gap:8px; align-items:end; min-height:230px; padding:28px 24px 18px; background:var(--surface); border:1px solid var(--line); border-radius:16px; }}
    .bar-item {{ height:180px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:6px; }}
    .bar-value {{ min-height:20px; font-size:12px; font-weight:700; }}
    .bar {{ width:100%; max-width:44px; min-height:5px; border-radius:7px 7px 2px 2px; background:#dbe3ef; }}
    .bar.active {{ background:var(--brand); }}
    .bar-label {{ color:var(--muted); font-size:12px; }}
    .narrative {{ padding:32px; background:var(--surface); border:1px solid var(--line); border-radius:16px; font-size:16px; line-height:1.85; }}
    .narrative p + p {{ margin-top:18px; }}
    details {{ margin-top:16px; background:var(--surface); border:1px solid var(--line); border-radius:12px; }}
    summary {{ padding:16px 18px; cursor:pointer; font-weight:700; }}
    .question-list {{ margin:0; padding:0 18px 18px 42px; }}
    .question-list li {{ padding:8px 0; }}
    .question-meta {{ display:block; color:var(--muted); font-size:12px; }}
    .warning {{ padding:20px 22px; border-radius:14px; background:var(--warn-bg); border:1px solid #fed7aa; }}
    dialog {{ width:min(1020px,calc(100vw - 40px)); max-height:calc(100vh - 40px); padding:0; border:0; border-radius:18px; box-shadow:0 16px 48px rgba(16,24,39,.24); }}
    dialog::backdrop {{ background:rgba(16,24,39,.64); }}
    .dialog-head {{ position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 22px; background:#fff; border-bottom:1px solid var(--line); }}
    .dialog-close {{ width:40px; height:40px; border:1px solid var(--line); border-radius:10px; background:#fff; cursor:pointer; font-size:22px; }}
    .dialog-body {{ display:grid; grid-template-columns:minmax(0,1.6fr) minmax(260px,.7fr); gap:22px; padding:22px; }}
    .slide-frame {{ position:relative; align-self:start; overflow:hidden; border-radius:12px; border:1px solid var(--line); background:#eef2f7; }}
    .slide-frame img {{ display:block; width:100%; height:auto; }}
    .pin {{ position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; border:4px solid #fff; border-radius:50%; background:var(--error); box-shadow:0 0 0 3px rgba(229,72,77,.45); }}
    .dialog-questions {{ margin:0; padding-left:20px; }}
    .dialog-questions li {{ margin-bottom:12px; }}
    @media (max-width:780px) {{ .shell {{ padding:24px 16px 60px; }} .topline {{ display:block; }} .badge {{ margin-top:14px; }} .metrics {{ grid-template-columns:repeat(2,1fr); }} .claim-grid {{ grid-template-columns:1fr; }} .dialog-body {{ grid-template-columns:1fr; }} .chart {{ gap:3px; padding-inline:10px; }} }}
  </style>
</head>
<body>
  <main class="shell">
    <div class="topline">
      <div><div class="eyebrow">ClassPin · instructor report preview</div><h1 id="report-title"></h1><p class="muted" id="report-meta"></p></div>
      <span class="badge">근거 수준 제한적</span>
    </div>
    <div class="tabs" role="group" aria-label="리포트 보기 형식">
      <button class="tab" id="tab-a" type="button" aria-pressed="true">A형 · 근거 카드</button>
      <button class="tab" id="tab-b" type="button" aria-pressed="false">B형 · 서술형</button>
    </div>
    <section class="metrics" id="metrics" aria-label="분석 범위"></section>
    <div class="view" id="view-a">
      <section><h2>다음 강의 전 확인할 항목</h2><div class="claim-grid" id="claim-grid"></div></section>
      <section class="section"><h2>슬라이드별 질문 분포</h2><div class="chart" id="chart"></div></section>
    </div>
    <div class="view" id="view-b" hidden>
      <section><h2>강의 개선 요약</h2><article class="narrative" id="narrative"></article></section>
    </div>
    <section class="section"><h2>전체 질문 snapshot</h2><details><summary>질문 17개 펼쳐보기</summary><ol class="question-list" id="question-list"></ol></details></section>
    <section class="section warning"><h2>이 결과를 해석할 때</h2><ul id="limitations"></ul></section>
  </main>
  <dialog id="evidence-dialog" aria-labelledby="dialog-title">
    <div class="dialog-head"><div><strong id="dialog-title">근거 보기</strong><div class="muted" id="dialog-subtitle"></div></div><button class="dialog-close" type="button" aria-label="근거 창 닫기">×</button></div>
    <div class="dialog-body"><div class="slide-frame"><img id="dialog-image" alt=""><span class="pin" id="dialog-pin" hidden></span></div><div><h3>연결된 질문</h3><ol class="dialog-questions" id="dialog-questions"></ol><p class="muted" id="dialog-region"></p></div></div>
  </dialog>
  <script type="application/json" id="report-data">{payload}</script>
  <script>
    const report = JSON.parse(document.getElementById('report-data').textContent);
    const bySlide = new Map(report.questions.map(q => [q.slide, []]));
    report.questions.forEach(q => bySlide.get(q.slide).push(q));
    const text = (tag, value, className) => {{ const el=document.createElement(tag); el.textContent=value; if(className) el.className=className; return el; }};
    document.getElementById('report-title').textContent=report.title;
    document.getElementById('report-meta').textContent=`${{report.material}} · 기준일 ${{report.generatedAt}} · 로컬 검토용`;
    const metrics=[['15장','분석 대상 슬라이드'],[`${{report.scope.questions}}개`,'질문 snapshot'],[`${{report.scope.questionSlides}}장`,'질문이 있는 슬라이드'],[`${{report.scope.unanswered}}개`,'미답변 질문']];
    metrics.forEach(([value,label])=>{{const card=text('div','', 'metric');card.append(text('strong',value),text('span',label));document.getElementById('metrics').append(card);}});
    report.claims.forEach(claim=>{{
      const card=text('article','', 'card'); const top=text('div','', 'card-top'); const title=text('h3',claim.title); const level=text('span',claim.level,'level'+(claim.level==='충분'?' good':'')); top.append(title,level);
      const body=text('p',claim.body); const refs=text('div',`근거: ${{claim.questionRefs.join(', ')}}${{claim.regionRef ? ' · '+claim.regionRef : ''}}`,'refs');
      const button=text('button','근거 보기','evidence-button'); button.type='button'; button.dataset.slides=claim.slideRefs.join(','); button.dataset.claim=claim.id;
      card.append(top,body,refs,button); document.getElementById('claim-grid').append(card);
    }});
    const max=Math.max(...report.slideCounts.map(item=>item.count));
    report.slideCounts.forEach(item=>{{const wrap=text('div','', 'bar-item');wrap.append(text('span',item.count?String(item.count):'','bar-value'));const bar=text('span','', 'bar'+(item.count?' active':''));bar.style.height=`${{Math.max(5,item.count/max*130)}}px`;bar.title=`Slide ${{item.slide}} 질문 ${{item.count}}개`;wrap.append(bar,text('span',String(item.slide),'bar-label'));document.getElementById('chart').append(wrap);}});
    const narrative=document.getElementById('narrative');
    narrative.append(text('p',`이 자료에는 15장의 슬라이드와 17개의 질문이 있으며, 질문은 10개 슬라이드에 분포합니다. 현재 snapshot에서는 17개 모두 미답변입니다.`));
    narrative.append(text('p',`질문이 가장 많이 모인 곳은 Slide 3과 5로 각각 3개입니다. 이어 Slide 2, 11, 12에 각각 2개가 있습니다. 이 수치는 이해 실패를 확정하는 점수가 아니라 다음 강의 전에 먼저 확인할 위치를 정하는 신호입니다.`));
    narrative.append(text('p',`질문 내용에서는 성장 판단, 표본, 측정 방식과 선택 이유를 묻는 표현이 반복됩니다. 해당 슬라이드의 수치와 결론 옆에 출처·대상·기간·선정 기준을 명시하고, 관계 구조는 구체적인 예시로 다시 설명하는 것이 좋습니다.`));
    narrative.append(text('p',`Slide 8의 한 질문은 AI 생성 이미지보다 실제 프로토타입이 낫지 않은지 묻습니다. 이 질문은 우측 ‘향후 B2B 확장 방향’ 영역에 연결됩니다. 질문 한 건이므로 반복 패턴으로 단정하지 않고, 개념 이미지와 실제 구현 화면을 구분하라는 개별 신호로 다룹니다.`));
    report.questions.forEach(q=>{{const li=text('li',q.question);li.append(text('span',`${{q.alias}} · Slide ${{q.slide}} · ${{q.category}} · 미답변`,'question-meta'));document.getElementById('question-list').append(li);}});
    report.limitations.forEach(item=>document.getElementById('limitations').append(text('li',item)));
    const setView=(name)=>{{const a=name==='a';document.getElementById('view-a').hidden=!a;document.getElementById('view-b').hidden=a;document.getElementById('tab-a').setAttribute('aria-pressed',String(a));document.getElementById('tab-b').setAttribute('aria-pressed',String(!a));}};
    document.getElementById('tab-a').addEventListener('click',()=>setView('a')); document.getElementById('tab-b').addEventListener('click',()=>setView('b'));
    const dialog=document.getElementById('evidence-dialog'); const close=document.querySelector('.dialog-close');
    document.querySelectorAll('.evidence-button').forEach(button=>button.addEventListener('click',()=>{{
      const slides=button.dataset.slides.split(',').map(Number); const slide=slides.find(value=>report.images[String(value)]) ?? slides[0]; const questions=slides.flatMap(value=>bySlide.get(value)||[]);
      document.getElementById('dialog-title').textContent=`${{button.dataset.claim}} 근거`;
      document.getElementById('dialog-subtitle').textContent=`Slide ${{slides.join(', ')}} · 질문 ${{questions.length}}개`;
      const image=document.getElementById('dialog-image'); image.src=report.images[String(slide)]||''; image.alt=`Slide ${{slide}} 비식별화 근거 이미지`;
      const list=document.getElementById('dialog-questions'); list.replaceChildren(); questions.forEach(q=>{{const li=text('li',q.question);li.append(text('span',`${{q.alias}} · Slide ${{q.slide}}`,'question-meta'));list.append(li);}});
      const pin=document.getElementById('dialog-pin'); const q=questions.find(item=>item.slide===8 && item.coords && item.kind==='point'); pin.hidden=!q; if(q){{pin.style.left=`${{q.coords.x*100}}%`;pin.style.top=`${{q.coords.y*100}}%`;}}
      document.getElementById('dialog-region').textContent=slide===8?'검증된 연결: S008:R003 · contains · 1.0':'이 슬라이드는 아직 상위 의미 영역 연결이 확정되지 않았습니다.';
      dialog.showModal();
    }}));
    close.addEventListener('click',()=>dialog.close()); dialog.addEventListener('click',event=>{{if(event.target===dialog)dialog.close();}});
  </script>
</body>
</html>
"""


def render_preview(
    baseline_path: Path,
    questions_path: Path,
    semantic_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    baseline = load_json(baseline_path)
    questions = normalize_questions(load_json(questions_path))
    report = build_report_data(questions)
    require_empty_output(output_dir)
    images = copy_evidence_images(baseline, baseline_path.parent, semantic_dir, output_dir)
    (output_dir / "index.html").write_text(render_html(report, images), encoding="utf-8")
    (output_dir / "report-data.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a local-only instructor report preview.")
    parser.add_argument("baseline_manifest", type=Path)
    parser.add_argument("questions", type=Path)
    parser.add_argument("semantic_output", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = args.output.resolve()
    report = render_preview(
        args.baseline_manifest.resolve(),
        args.questions.resolve(),
        args.semantic_output.resolve(),
        output,
    )
    print(
        json.dumps(
            {
                "output": str(output / "index.html"),
                "slides": report["scope"]["slides"],
                "questions": report["scope"]["questions"],
                "claims": len(report["claims"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
