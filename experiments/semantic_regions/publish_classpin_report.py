from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import require_empty_output
    from experiments.semantic_regions.ocr_redaction import redact_text
except ModuleNotFoundError:
    from extract_regions import require_empty_output  # type: ignore[no-redef]
    from ocr_redaction import redact_text  # type: ignore[no-redef]


SESSION_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def build_report_bundle(
    run: dict[str, Any],
    questions: dict[str, Any],
    *,
    session_id: str,
    slide_number: int,
) -> dict[str, Any]:
    if not SESSION_ID_PATTERN.fullmatch(session_id):
        raise ValueError("session_id must be a UUID")
    if slide_number < 1:
        raise ValueError("slide_number must be positive")

    question_by_alias = {
        str(question.get("questionAlias")): question
        for question in questions.get("questions") or []
        if int(question.get("slideNumber") or 0) == slide_number
    }
    mapping_by_alias = {
        str(mapping.get("questionAlias")): mapping for mapping in run.get("pinMappings") or []
    }
    pins = []
    for analysis in run.get("pinSemanticAnalyses") or []:
        alias = str(analysis["questionAlias"])
        question = question_by_alias.get(alias, {})
        question_text, _ = redact_text(str(question.get("question") or ""))
        mapping = mapping_by_alias.get(alias, {})
        pins.append(
            {
                "questionAlias": alias,
                "question": question_text,
                "category": str(question.get("category") or ""),
                "regionAlias": str(analysis["regionAlias"]),
                "mappingStatus": str(mapping.get("mappingStatus") or "unknown"),
                "relation": str(analysis["relation"]),
                "analysis": str(analysis["analysis"]),
                "instructorAction": str(analysis["instructorAction"]),
                "confidence": float(analysis["confidence"]),
            }
        )

    metrics = run["metrics"]
    model = run["model"]
    return {
        "schemaVersion": "classpin-local-ai-report.v1",
        "evaluationOnly": True,
        "sessionId": session_id,
        "slideNumber": slide_number,
        "slideAlias": str(run["slideAlias"]),
        "image": f"slide-{slide_number:03d}.semantic-overlay.jpg",
        "summary": str(run["semanticEnrichment"]["slideSummary"]),
        "keyConcepts": [str(value) for value in run["semanticEnrichment"].get("keyConcepts") or []],
        "stats": {
            "ocrElements": int(run["inputElementCount"]),
            "semanticRegions": int(run["semanticRegionCount"]),
            "ignoredElements": int(run["ignoredElementCount"]),
            "analyzedPins": len(pins),
        },
        "regions": run["artifact"]["regions"],
        "pins": pins,
        "qualityWarnings": run.get("semanticQualityWarnings") or [],
        "runtime": {
            "model": str(model["name"]),
            "license": str(model["license"]),
            "elapsedMs": float(metrics["elapsedMs"]),
            "peakProcessTreeRssMb": float(metrics["peakProcessTreeRssMb"]),
            "externalApiCostKrw": 0,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish a redacted local AI report bundle for the ClassPin web UI."
    )
    parser.add_argument("run", type=Path)
    parser.add_argument("overlay_image", type=Path)
    parser.add_argument("questions", type=Path)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--slide-number", type=int, required=True)
    parser.add_argument("--public-root", type=Path, default=Path("public/generated/ai-reports"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run = json.loads(args.run.read_text(encoding="utf-8"))
    questions = json.loads(args.questions.read_text(encoding="utf-8"))
    bundle = build_report_bundle(
        run,
        questions,
        session_id=args.session_id,
        slide_number=args.slide_number,
    )

    output = (args.public_root / args.session_id).resolve()
    require_empty_output(output)
    image_name = str(bundle["image"])
    shutil.copyfile(args.overlay_image.resolve(), output / image_name)
    (output / "report.json").write_text(
        json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output": str(output), "report": str(output / "report.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
