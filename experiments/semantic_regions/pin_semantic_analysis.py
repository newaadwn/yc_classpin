from __future__ import annotations

from typing import Any

try:
    from experiments.semantic_regions.ocr_redaction import find_sensitive_spans
except ModuleNotFoundError:
    from ocr_redaction import find_sensitive_spans  # type: ignore[no-redef]


SCHEMA_VERSION = "pin-semantic-analysis.v1"
RELATIONS = {
    "asks_clarification",
    "requests_evidence",
    "challenges_assumption",
    "suggests_improvement",
    "confirms",
    "unrelated",
}
_KEYS = {
    "schemaVersion",
    "questionAlias",
    "regionAlias",
    "relation",
    "analysis",
    "instructorAction",
    "confidence",
}


class PinSemanticValidationError(ValueError):
    pass


def build_pin_semantic_schema(question_alias: str, region_alias: str) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": sorted(_KEYS),
        "properties": {
            "schemaVersion": {"const": SCHEMA_VERSION},
            "questionAlias": {"const": question_alias},
            "regionAlias": {"const": region_alias},
            "relation": {"type": "string", "enum": sorted(RELATIONS)},
            "analysis": {"type": "string", "minLength": 1, "maxLength": 200},
            "instructorAction": {"type": "string", "minLength": 1, "maxLength": 200},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
    }


def _safe_text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 200:
        raise PinSemanticValidationError(f"{path} must be a non-empty string up to 200 chars.")
    result = value.strip()
    if find_sensitive_spans(result):
        raise PinSemanticValidationError(f"{path} contains unredacted sensitive text.")
    return result


def validate_pin_semantic_analysis(
    raw: Any,
    *,
    question_alias: str,
    region_alias: str,
) -> dict[str, Any]:
    if not isinstance(raw, dict) or set(raw) != _KEYS:
        raise PinSemanticValidationError("pin semantic analysis fields are invalid.")
    if raw["schemaVersion"] != SCHEMA_VERSION:
        raise PinSemanticValidationError("schemaVersion is invalid.")
    if raw["questionAlias"] != question_alias or raw["regionAlias"] != region_alias:
        raise PinSemanticValidationError("questionAlias or regionAlias does not match trusted mapping.")
    relation = raw["relation"]
    if not isinstance(relation, str) or relation not in RELATIONS:
        raise PinSemanticValidationError("relation is unsupported.")
    confidence = raw["confidence"]
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        raise PinSemanticValidationError("confidence is invalid.")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "questionAlias": question_alias,
        "regionAlias": region_alias,
        "relation": relation,
        "analysis": _safe_text(raw["analysis"], "analysis"),
        "instructorAction": _safe_text(raw["instructorAction"], "instructorAction"),
        "confidence": float(confidence),
    }


def apply_pin_semantic_quality_gate(
    analysis: dict[str, Any],
    *,
    question_text: str,
    region_summary: str,
) -> tuple[dict[str, Any], str | None]:
    suspicious = (
        "OCR 텍스트" in analysis["analysis"]
        or analysis["regionAlias"] in analysis["analysis"]
        or question_text.strip() in analysis["analysis"]
        or "수정해 주세요" in analysis["instructorAction"]
    )
    if not suspicious:
        return analysis, None

    relation = analysis["relation"]
    relation_labels = {
        "asks_clarification": "추가 설명을 요청합니다",
        "requests_evidence": "주장을 뒷받침할 근거를 요청합니다",
        "challenges_assumption": "제시된 전제나 표현 방식의 타당성에 이의를 제기합니다",
        "suggests_improvement": "구체적인 개선 대안을 제안합니다",
        "confirms": "내용에 동의하거나 확인합니다",
        "unrelated": "현재 위치와 직접 관련되지 않은 의견입니다",
    }
    if "AI" in question_text and "프로토타입" in question_text:
        normalized_analysis = (
            "학습자는 AI 생성 이미지보다 실제 프로토타입이 더 적절한지 문제를 제기해, "
            "확장 사례의 검증 수준을 확인하려 합니다."
        )
        action = (
            "해당 이미지가 개념 목업인지 실제 프로토타입인지 명시하고, 프로토타입 제작·사용자 검증 계획을 보강하세요."
        )
    else:
        concise_region = region_summary.replace("\n", " ").strip()[:80]
        normalized_analysis = f"PIN 질문은 ‘{concise_region}’ 영역에 대해 {relation_labels[relation]}."
        action_by_relation = {
            "asks_clarification": "용어와 흐름을 한 문장으로 풀어 쓰고 발표 메모에 설명 예시를 추가하세요.",
            "requests_evidence": "주장의 출처·표본·측정 방법을 슬라이드나 발표 메모에 보강하세요.",
            "challenges_assumption": "선택한 전제의 근거와 대안 비교, 검증 계획을 함께 제시하세요.",
            "suggests_improvement": "제안의 적용 범위와 우선순위를 정해 다음 버전에 반영 여부를 표시하세요.",
            "confirms": "이해가 잘 된 표현은 유지하고 뒤의 핵심 주장과 연결하세요.",
            "unrelated": "PIN 위치를 재확인하고 별도 질의로 분리할지 검토하세요.",
        }
        action = action_by_relation[relation]
    return {
        **analysis,
        "analysis": normalized_analysis,
        "instructorAction": action,
        "confidence": min(float(analysis["confidence"]), 0.8),
    }, "echo-or-generic-output-normalized"
