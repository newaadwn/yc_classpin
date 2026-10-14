from __future__ import annotations

import math
from collections import Counter
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import REGION_TYPES
    from experiments.semantic_regions.ocr_redaction import find_sensitive_spans
    from experiments.semantic_regions.semantic_grouping import (
        GROUPING_PROMPT_VERSION,
        GROUPING_SCHEMA_VERSION,
        GroupingValidationError,
    )
except ModuleNotFoundError:
    from extract_regions import REGION_TYPES  # type: ignore[no-redef]
    from ocr_redaction import find_sensitive_spans  # type: ignore[no-redef]
    from semantic_grouping import (  # type: ignore[no-redef]
        GROUPING_PROMPT_VERSION,
        GROUPING_SCHEMA_VERSION,
        GroupingValidationError,
    )


ENRICHMENT_SCHEMA_VERSION = "semantic-region-enrichment.v1"
ENRICHMENT_PROMPT_VERSION = "semantic-region-enrichment.v1"
_IMPORTANCE = {"low", "medium", "high"}
_ROOT_KEYS = {
    "schemaVersion",
    "promptVersion",
    "slideAlias",
    "slideSummary",
    "keyConcepts",
    "regions",
}
_REGION_KEYS = {
    "candidateAlias",
    "type",
    "summary",
    "concepts",
    "importance",
    "confidence",
}


def _text(region: dict[str, Any]) -> str:
    return str(region.get("textRedacted") or region.get("summary") or "").strip()


def _bbox(region: dict[str, Any]) -> dict[str, float]:
    value = region["bboxNorm"]
    return {key: float(value[key]) for key in ("x1", "y1", "x2", "y2")}


def _center(region: dict[str, Any]) -> tuple[float, float]:
    box = _bbox(region)
    return ((box["x1"] + box["x2"]) / 2, (box["y1"] + box["y2"]) / 2)


def _is_useful(region: dict[str, Any]) -> bool:
    text = _text(region)
    meaningful = sum(character.isalnum() for character in text)
    box = _bbox(region)
    area = max(0.0, box["x2"] - box["x1"]) * max(0.0, box["y2"] - box["y1"])
    confidence = float(region.get("confidence") or 0)
    return meaningful >= 2 and (confidence >= 0.15 or area >= 0.001)


def _kmeans(regions: list[dict[str, Any]], count: int) -> list[list[dict[str, Any]]]:
    if count < 1 or count > len(regions):
        raise ValueError("cluster count must be within the number of regions.")
    points = [(_center(region)[0] * 1.35, _center(region)[1]) for region in regions]
    first_index = min(range(len(points)), key=lambda index: (points[index][1], points[index][0], index))
    centroids = [points[first_index]]
    while len(centroids) < count:
        next_index = max(
            range(len(points)),
            key=lambda index: (
                min(
                    (points[index][0] - center[0]) ** 2 + (points[index][1] - center[1]) ** 2
                    for center in centroids
                ),
                -index,
            ),
        )
        centroids.append(points[next_index])

    assignments = [0] * len(points)
    for _ in range(40):
        new_assignments = [
            min(
                range(count),
                key=lambda cluster: (
                    (point[0] - centroids[cluster][0]) ** 2
                    + (point[1] - centroids[cluster][1]) ** 2,
                    cluster,
                ),
            )
            for point in points
        ]
        if new_assignments == assignments and _ > 0:
            break
        assignments = new_assignments
        for cluster in range(count):
            members = [points[index] for index, assigned in enumerate(assignments) if assigned == cluster]
            if members:
                centroids[cluster] = (
                    sum(point[0] for point in members) / len(members),
                    sum(point[1] for point in members) / len(members),
                )

    return [
        [region for region, assigned in zip(regions, assignments) if assigned == cluster]
        for cluster in range(count)
    ]


def _kmeans_axis(
    regions: list[dict[str, Any]],
    count: int,
    *,
    axis: int,
) -> list[list[dict[str, Any]]]:
    if count <= 1:
        return [regions]
    values = [_center(region)[axis] for region in regions]
    centroids = [min(values) + (max(values) - min(values)) * index / (count - 1) for index in range(count)]
    assignments = [0] * len(values)
    for iteration in range(40):
        updated = [
            min(range(count), key=lambda cluster: (abs(value - centroids[cluster]), cluster))
            for value in values
        ]
        if updated == assignments and iteration > 0:
            break
        assignments = updated
        for cluster in range(count):
            members = [value for value, assigned in zip(values, assignments) if assigned == cluster]
            if members:
                centroids[cluster] = sum(members) / len(members)
    return [
        [region for region, assigned in zip(regions, assignments) if assigned == cluster]
        for cluster in range(count)
        if any(assigned == cluster for assigned in assignments)
    ]


def _column_then_row_clusters(
    regions: list[dict[str, Any]],
    count: int,
) -> list[list[dict[str, Any]]]:
    ordered = sorted(regions, key=lambda region: _center(region)[0])
    gaps = [
        (_center(ordered[index + 1])[0] - _center(ordered[index])[0], index)
        for index in range(len(ordered) - 1)
    ]
    largest_gap, split_index = max(gaps, default=(0.0, 0))
    left = ordered[: split_index + 1]
    right = ordered[split_index + 1 :]
    if largest_gap < 0.055 or min(len(left), len(right)) < 3 or count < 3:
        return _kmeans(regions, count)

    left_count = max(1, min(count - 1, round(count * len(left) / len(regions))))
    right_count = count - left_count
    return [
        *_kmeans_axis(left, min(left_count, len(left)), axis=1),
        *_kmeans_axis(right, min(right_count, len(right)), axis=1),
    ]


def _group_bbox(members: list[dict[str, Any]]) -> dict[str, float]:
    boxes = [_bbox(member) for member in members]
    return {
        "x1": round(min(box["x1"] for box in boxes), 6),
        "y1": round(min(box["y1"] for box in boxes), 6),
        "x2": round(max(box["x2"] for box in boxes), 6),
        "y2": round(max(box["y2"] for box in boxes), 6),
    }


def _make_group(members: list[dict[str, Any]], *, forced_type: str | None = None) -> dict[str, Any]:
    ordered = sorted(members, key=lambda item: (int(item.get("readingOrder") or 0), str(item["alias"])))
    text = " | ".join(_text(member) for member in ordered if _text(member))[:500]
    region_types = [str(member.get("type") or "other") for member in ordered]
    region_type = forced_type or Counter(region_types).most_common(1)[0][0]
    if region_type not in REGION_TYPES:
        region_type = "other"
    confidence_values = [float(member.get("confidence") or 0) for member in ordered]
    return {
        "type": region_type,
        "memberAliases": [str(member["alias"]) for member in ordered],
        "summary": text or "OCR 텍스트가 불분명한 시각 영역",
        "concepts": [],
        "importance": "high" if forced_type == "title" else "medium",
        "confidence": round(sum(confidence_values) / len(confidence_values), 4),
        "_bbox": _group_bbox(ordered),
    }


def build_spatial_candidates(
    page: dict[str, Any],
    *,
    slide_alias: str,
    max_regions: int = 8,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    raw_regions = page.get("regions")
    if not isinstance(raw_regions, list) or not raw_regions:
        raise GroupingValidationError("baseline page must contain OCR regions.")
    useful = [region for region in raw_regions if _is_useful(region)]
    ignored = [str(region["alias"]) for region in raw_regions if not _is_useful(region)]
    header = [
        region
        for region in useful
        if _bbox(region)["y2"] <= 0.14 and _bbox(region)["x1"] < 0.85
    ]
    corner = [
        region
        for region in useful
        if _bbox(region)["y2"] <= 0.14 and _bbox(region)["x1"] >= 0.85
    ]
    reserved_aliases = {str(region["alias"]) for region in [*header, *corner]}
    main = [region for region in useful if str(region["alias"]) not in reserved_aliases]
    reserved = int(bool(header)) + int(bool(corner))
    if len(main) < 2:
        raise GroupingValidationError("not enough useful OCR elements for spatial candidates.")
    main_count = min(
        max_regions - reserved,
        len(main),
        max(2, round(math.sqrt(len(main) / 1.5))),
    )
    groups = (
        ([_make_group(header, forced_type="title")] if header else [])
        + ([_make_group(corner, forced_type="title")] if corner else [])
        + [
            _make_group(cluster)
            for cluster in _column_then_row_clusters(main, main_count)
            if cluster
        ]
    )
    groups.sort(key=lambda group: (group["_bbox"]["y1"], group["_bbox"]["x1"]))

    candidates: list[dict[str, Any]] = []
    grouping_groups: list[dict[str, Any]] = []
    for index, group in enumerate(groups, start=1):
        candidate_alias = f"C{index:03d}"
        bbox = group.pop("_bbox")
        candidates.append(
            {
                "candidateAlias": candidate_alias,
                "bboxNorm": bbox,
                "memberAliases": group["memberAliases"],
                "textRedacted": group["summary"],
            }
        )
        grouping_groups.append(group)

    grouping = {
        "schemaVersion": GROUPING_SCHEMA_VERSION,
        "promptVersion": GROUPING_PROMPT_VERSION,
        "slideAlias": slide_alias,
        "slideSummary": "공간 후보의 의미 분석 대기 중",
        "keyConcepts": [],
        "groups": grouping_groups,
        "ignoredMemberAliases": ignored,
    }
    return grouping, candidates


def build_summary_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["slideSummary", "keyConcepts"],
        "properties": {
            "slideSummary": {"type": "string", "minLength": 1, "maxLength": 500},
            "keyConcepts": {
                "type": "array",
                "maxItems": 8,
                "items": {"type": "string", "minLength": 1, "maxLength": 60},
            },
        },
    }


def build_single_candidate_schema(candidate_alias: str) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": sorted(_REGION_KEYS),
        "properties": {
            "candidateAlias": {"const": candidate_alias},
            "type": {"type": "string", "enum": sorted(REGION_TYPES)},
            "summary": {"type": "string", "minLength": 1, "maxLength": 300},
            "concepts": {
                "type": "array",
                "maxItems": 4,
                "items": {"type": "string", "minLength": 1, "maxLength": 60},
            },
            "importance": {"type": "string", "enum": sorted(_IMPORTANCE)},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
    }
def _safe_string(value: Any, path: str, max_length: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > max_length:
        raise GroupingValidationError(f"{path} must be a non-empty string up to {max_length} chars.")
    result = value.strip()
    if find_sensitive_spans(result):
        raise GroupingValidationError(f"{path} contains unredacted sensitive text.")
    return result


def validate_enrichment(
    raw: Any,
    *,
    expected_slide_alias: str,
    candidate_aliases: list[str],
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise GroupingValidationError("enrichment must be an object.")
    missing = _ROOT_KEYS - set(raw)
    unknown = set(raw) - _ROOT_KEYS
    if missing or unknown:
        raise GroupingValidationError(f"enrichment fields are invalid; missing={sorted(missing)}, unknown={sorted(unknown)}")
    if raw["schemaVersion"] != ENRICHMENT_SCHEMA_VERSION:
        raise GroupingValidationError("enrichment.schemaVersion is invalid.")
    if raw["promptVersion"] != ENRICHMENT_PROMPT_VERSION:
        raise GroupingValidationError("enrichment.promptVersion is invalid.")
    if raw["slideAlias"] != expected_slide_alias:
        raise GroupingValidationError("enrichment.slideAlias does not match.")
    regions = raw["regions"]
    if not isinstance(regions, list) or len(regions) != len(candidate_aliases):
        raise GroupingValidationError("enrichment must contain exactly one result per candidate.")

    by_alias: dict[str, dict[str, Any]] = {}
    for index, region in enumerate(regions):
        path = f"enrichment.regions[{index}]"
        if not isinstance(region, dict) or set(region) != _REGION_KEYS:
            raise GroupingValidationError(f"{path} fields are invalid.")
        alias = region["candidateAlias"]
        if not isinstance(alias, str) or alias not in candidate_aliases:
            raise GroupingValidationError(f"{path}.candidateAlias is unknown.")
        if alias in by_alias:
            raise GroupingValidationError(f"{path}.candidateAlias is duplicated.")
        region_type = region["type"]
        if not isinstance(region_type, str) or region_type not in REGION_TYPES:
            raise GroupingValidationError(f"{path}.type is unsupported.")
        concepts = region["concepts"]
        if not isinstance(concepts, list) or len(concepts) > 4 or len(concepts) != len(set(concepts)):
            raise GroupingValidationError(f"{path}.concepts is invalid.")
        safe_concepts = [_safe_string(item, f"{path}.concepts", 60) for item in concepts]
        importance = region["importance"]
        confidence = region["confidence"]
        if importance not in _IMPORTANCE:
            raise GroupingValidationError(f"{path}.importance is unsupported.")
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            raise GroupingValidationError(f"{path}.confidence is invalid.")
        by_alias[alias] = {
            "candidateAlias": alias,
            "type": region_type,
            "summary": _safe_string(region["summary"], f"{path}.summary", 300),
            "concepts": safe_concepts,
            "importance": importance,
            "confidence": float(confidence),
        }
    if set(by_alias) != set(candidate_aliases):
        raise GroupingValidationError("enrichment candidate aliases are incomplete.")
    key_concepts = raw["keyConcepts"]
    if not isinstance(key_concepts, list) or len(key_concepts) > 8 or len(key_concepts) != len(set(key_concepts)):
        raise GroupingValidationError("enrichment.keyConcepts is invalid.")
    return {
        "schemaVersion": ENRICHMENT_SCHEMA_VERSION,
        "promptVersion": ENRICHMENT_PROMPT_VERSION,
        "slideAlias": expected_slide_alias,
        "slideSummary": _safe_string(raw["slideSummary"], "enrichment.slideSummary", 500),
        "keyConcepts": [_safe_string(item, "enrichment.keyConcepts", 60) for item in key_concepts],
        "regions": [by_alias[alias] for alias in candidate_aliases],
    }


def merge_enrichment(
    spatial_grouping: dict[str, Any],
    enrichment: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    aliases = [candidate["candidateAlias"] for candidate in candidates]
    validated = validate_enrichment(
        enrichment,
        expected_slide_alias=spatial_grouping["slideAlias"],
        candidate_aliases=aliases,
    )
    semantic_by_alias = {region["candidateAlias"]: region for region in validated["regions"]}
    groups = []
    for candidate, spatial_group in zip(candidates, spatial_grouping["groups"]):
        semantic = semantic_by_alias[candidate["candidateAlias"]]
        groups.append(
            {
                "type": semantic["type"],
                "memberAliases": list(spatial_group["memberAliases"]),
                "summary": semantic["summary"],
                "concepts": semantic["concepts"],
                "importance": semantic["importance"],
                "confidence": semantic["confidence"],
            }
        )
    return {
        **spatial_grouping,
        "slideSummary": validated["slideSummary"],
        "keyConcepts": validated["keyConcepts"],
        "groups": groups,
    }


def apply_grounding_quality_gate(
    enrichment: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Downgrade generic or overconfident outputs without adding semantic claims."""
    result = {
        **enrichment,
        "keyConcepts": list(enrichment["keyConcepts"]),
        "regions": [dict(region) for region in enrichment["regions"]],
    }
    candidates_by_alias = {candidate["candidateAlias"]: candidate for candidate in candidates}
    warnings: list[dict[str, str]] = []
    generic_phrases = (
        "강의 주제를 설명",
        "강의의 주제를 설명",
        "강의 주제",
    )
    generic_concepts = set(REGION_TYPES) | {"교육", "학습", "강의"}
    for region in result["regions"]:
        alias = region["candidateAlias"]
        candidate = candidates_by_alias[alias]
        summary = region["summary"]
        concepts = region["concepts"]
        if any(phrase in summary for phrase in generic_phrases) or any(
            str(concept).strip().lower() in generic_concepts for concept in concepts
        ):
            visible = str(candidate.get("textRedacted") or "").replace("\n", " ").strip()[:100]
            region.update(
                {
                    "type": "other",
                    "summary": f"OCR 근거가 불충분해 의미 확인이 필요한 영역: {visible}",
                    "concepts": [],
                    "importance": "low",
                    "confidence": min(float(region["confidence"]), 0.3),
                }
            )
            warnings.append({"candidateAlias": alias, "reason": "generic-semantic-output"})
            continue
        meaningful = sum(character.isalnum() for character in str(candidate.get("textRedacted") or ""))
        if meaningful < 4 and float(region["confidence"]) > 0.5:
            region["confidence"] = 0.5
            warnings.append({"candidateAlias": alias, "reason": "sparse-ocr-confidence-capped"})
    return result, warnings
