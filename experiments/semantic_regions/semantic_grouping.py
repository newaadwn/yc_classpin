from __future__ import annotations

import math
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import REGION_TYPES
    from experiments.semantic_regions.ocr_redaction import find_sensitive_spans
    from experiments.semantic_regions.semantic_region_v2 import build_slide_artifact
except ModuleNotFoundError:
    from extract_regions import REGION_TYPES  # type: ignore[no-redef]
    from ocr_redaction import find_sensitive_spans  # type: ignore[no-redef]
    from semantic_region_v2 import build_slide_artifact  # type: ignore[no-redef]


GROUPING_SCHEMA_VERSION = "semantic-region-grouping.v1"
GROUPING_PROMPT_VERSION = "semantic-region-grouping.v1"
GROUPING_PIPELINE_VERSION = "ocr-language-model-semantic-region.v1"
GROUPING_REGION_SOURCE = "ocr-language-model"
MIN_GROUPS = 3
MAX_GROUPS = 12
DEFAULT_PADDING_X = 0.006
DEFAULT_PADDING_Y = 0.009

_ROOT_KEYS = {
    "schemaVersion",
    "promptVersion",
    "slideAlias",
    "slideSummary",
    "keyConcepts",
    "groups",
    "ignoredMemberAliases",
}
_GROUP_KEYS = {
    "type",
    "memberAliases",
    "summary",
    "concepts",
    "importance",
    "confidence",
}
_IMPORTANCE = {"low", "medium", "high"}


class GroupingValidationError(ValueError):
    """Raised when untrusted language-model grouping is not a valid partition."""


def _require_exact_keys(value: dict[str, Any], expected: set[str], path: str) -> None:
    missing = sorted(expected - set(value))
    unknown = sorted(set(value) - expected)
    if missing:
        raise GroupingValidationError(f"{path} is missing fields: {', '.join(missing)}")
    if unknown:
        raise GroupingValidationError(f"{path} has unknown fields: {', '.join(unknown)}")


def _require_string(
    value: Any,
    path: str,
    *,
    min_length: int = 1,
    max_length: int,
) -> str:
    if not isinstance(value, str):
        raise GroupingValidationError(f"{path} must be a string.")
    normalized = value.strip()
    if not min_length <= len(normalized) <= max_length:
        raise GroupingValidationError(
            f"{path} length must be between {min_length} and {max_length}."
        )
    if find_sensitive_spans(normalized):
        raise GroupingValidationError(f"{path} contains unredacted sensitive text.")
    return normalized


def _require_string_list(
    value: Any,
    path: str,
    *,
    max_items: int,
    max_length: int,
    allow_empty: bool = True,
) -> list[str]:
    if not isinstance(value, list) or len(value) > max_items:
        raise GroupingValidationError(f"{path} must contain at most {max_items} items.")
    if not allow_empty and not value:
        raise GroupingValidationError(f"{path} must not be empty.")
    result = [
        _require_string(item, f"{path}[{index}]", max_length=max_length)
        for index, item in enumerate(value)
    ]
    if len(result) != len(set(result)):
        raise GroupingValidationError(f"{path} must not contain duplicates.")
    return result


def _require_confidence(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise GroupingValidationError(f"{path} must be a number.")
    result = float(value)
    if not math.isfinite(result) or not 0 <= result <= 1:
        raise GroupingValidationError(f"{path} must be between 0 and 1.")
    return result


def _baseline_regions(page: dict[str, Any]) -> list[dict[str, Any]]:
    regions = page.get("regions")
    if not isinstance(regions, list) or not regions:
        raise GroupingValidationError("baseline page must contain regions.")
    aliases: set[str] = set()
    for index, region in enumerate(regions):
        if not isinstance(region, dict):
            raise GroupingValidationError(f"baseline regions[{index}] must be an object.")
        alias = region.get("alias")
        if not isinstance(alias, str) or not alias:
            raise GroupingValidationError(f"baseline regions[{index}].alias is invalid.")
        if alias in aliases:
            raise GroupingValidationError(f"baseline alias {alias} is duplicated.")
        bbox = region.get("bboxNorm")
        if not isinstance(bbox, dict) or set(bbox) != {"x1", "y1", "x2", "y2"}:
            raise GroupingValidationError(f"baseline region {alias} has an invalid bboxNorm.")
        aliases.add(alias)
    return regions


def validate_grouping(
    raw: Any,
    baseline_page: dict[str, Any],
    *,
    expected_slide_alias: str,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise GroupingValidationError("grouping must be an object.")
    _require_exact_keys(raw, _ROOT_KEYS, "grouping")
    if raw["schemaVersion"] != GROUPING_SCHEMA_VERSION:
        raise GroupingValidationError("grouping.schemaVersion is invalid.")
    if raw["promptVersion"] != GROUPING_PROMPT_VERSION:
        raise GroupingValidationError("grouping.promptVersion is invalid.")
    if raw["slideAlias"] != expected_slide_alias:
        raise GroupingValidationError("grouping.slideAlias does not match the requested slide.")

    baseline_regions = _baseline_regions(baseline_page)
    known_aliases = {str(region["alias"]) for region in baseline_regions}
    raw_groups = raw["groups"]
    if not isinstance(raw_groups, list) or not MIN_GROUPS <= len(raw_groups) <= MAX_GROUPS:
        raise GroupingValidationError(
            f"grouping.groups must contain between {MIN_GROUPS} and {MAX_GROUPS} items."
        )

    assigned: set[str] = set()
    groups: list[dict[str, Any]] = []
    for index, raw_group in enumerate(raw_groups):
        path = f"grouping.groups[{index}]"
        if not isinstance(raw_group, dict):
            raise GroupingValidationError(f"{path} must be an object.")
        _require_exact_keys(raw_group, _GROUP_KEYS, path)
        group_type = raw_group["type"]
        if not isinstance(group_type, str) or group_type not in REGION_TYPES:
            raise GroupingValidationError(f"{path}.type is not supported.")
        members = _require_string_list(
            raw_group["memberAliases"],
            f"{path}.memberAliases",
            max_items=len(known_aliases),
            max_length=16,
            allow_empty=False,
        )
        unknown = sorted(set(members) - known_aliases)
        if unknown:
            raise GroupingValidationError(f"{path} contains unknown aliases: {', '.join(unknown)}")
        duplicate = sorted(set(members) & assigned)
        if duplicate:
            raise GroupingValidationError(
                f"{path} reuses aliases already assigned elsewhere: {', '.join(duplicate)}"
            )
        assigned.update(members)
        importance = raw_group["importance"]
        if not isinstance(importance, str) or importance not in _IMPORTANCE:
            raise GroupingValidationError(f"{path}.importance is not supported.")
        groups.append(
            {
                "type": group_type,
                "memberAliases": members,
                "summary": _require_string(raw_group["summary"], f"{path}.summary", max_length=500),
                "concepts": _require_string_list(
                    raw_group["concepts"], f"{path}.concepts", max_items=8, max_length=80
                ),
                "importance": importance,
                "confidence": _require_confidence(raw_group["confidence"], f"{path}.confidence"),
            }
        )

    ignored = _require_string_list(
        raw["ignoredMemberAliases"],
        "grouping.ignoredMemberAliases",
        max_items=len(known_aliases),
        max_length=16,
    )
    unknown_ignored = sorted(set(ignored) - known_aliases)
    if unknown_ignored:
        raise GroupingValidationError(
            "grouping.ignoredMemberAliases contains unknown aliases: " + ", ".join(unknown_ignored)
        )
    duplicate_ignored = sorted(set(ignored) & assigned)
    if duplicate_ignored:
        raise GroupingValidationError(
            "grouping.ignoredMemberAliases reuses grouped aliases: " + ", ".join(duplicate_ignored)
        )
    accounted = assigned | set(ignored)
    missing = sorted(known_aliases - accounted)
    if missing:
        raise GroupingValidationError(
            "Every baseline element must be grouped or ignored; missing: " + ", ".join(missing)
        )

    return {
        "schemaVersion": GROUPING_SCHEMA_VERSION,
        "promptVersion": GROUPING_PROMPT_VERSION,
        "slideAlias": expected_slide_alias,
        "slideSummary": _require_string(raw["slideSummary"], "grouping.slideSummary", max_length=800),
        "keyConcepts": _require_string_list(
            raw["keyConcepts"], "grouping.keyConcepts", max_items=12, max_length=80
        ),
        "groups": groups,
        "ignoredMemberAliases": ignored,
    }


def _union_bbox(
    members: list[dict[str, Any]],
    *,
    padding_x: float,
    padding_y: float,
) -> dict[str, float]:
    boxes = [member["bboxNorm"] for member in members]
    return {
        "x1": round(max(0.0, min(float(box["x1"]) for box in boxes) - padding_x), 6),
        "y1": round(max(0.0, min(float(box["y1"]) for box in boxes) - padding_y), 6),
        "x2": round(min(1.0, max(float(box["x2"]) for box in boxes) + padding_x), 6),
        "y2": round(min(1.0, max(float(box["y2"]) for box in boxes) + padding_y), 6),
    }


def grouping_to_proposal(
    raw_grouping: Any,
    baseline_page: dict[str, Any],
    *,
    slide_alias: str,
    padding_x: float = DEFAULT_PADDING_X,
    padding_y: float = DEFAULT_PADDING_Y,
) -> dict[str, Any]:
    if not 0 <= padding_x <= 0.05 or not 0 <= padding_y <= 0.05:
        raise GroupingValidationError("padding must be between 0 and 0.05.")
    grouping = validate_grouping(raw_grouping, baseline_page, expected_slide_alias=slide_alias)
    regions_by_alias = {
        str(region["alias"]): region for region in _baseline_regions(baseline_page)
    }

    candidates: list[dict[str, Any]] = []
    for group in grouping["groups"]:
        members = sorted(
            (regions_by_alias[alias] for alias in group["memberAliases"]),
            key=lambda region: (int(region.get("readingOrder") or 0), str(region["alias"])),
        )
        bbox = _union_bbox(members, padding_x=padding_x, padding_y=padding_y)
        text = " | ".join(
            str(member.get("textRedacted") or member.get("summary") or "").strip()
            for member in members
            if str(member.get("textRedacted") or member.get("summary") or "").strip()
        )[:2000]
        candidates.append(
            {
                "type": group["type"],
                "bboxNorm": bbox,
                "polygonNorm": None,
                "textRedacted": text,
                "summary": group["summary"],
                "concepts": group["concepts"],
                "importance": group["importance"],
                "confidence": group["confidence"],
                "_sort": (bbox["y1"], bbox["x1"], min(int(m.get("readingOrder") or 0) for m in members)),
            }
        )
    candidates.sort(key=lambda candidate: candidate["_sort"])
    regions = []
    for reading_order, candidate in enumerate(candidates, start=1):
        candidate = dict(candidate)
        candidate.pop("_sort")
        regions.append({**candidate, "readingOrder": reading_order})

    return {
        "schemaVersion": "semantic-region-proposal.v2",
        "promptVersion": "semantic-region-proposal.v1",
        "slideAlias": slide_alias,
        "slideSummary": grouping["slideSummary"],
        "keyConcepts": grouping["keyConcepts"],
        "regions": regions,
    }


def build_grouped_slide_artifact(
    raw_grouping: Any,
    baseline_page: dict[str, Any],
    *,
    slide_alias: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    proposal = grouping_to_proposal(
        raw_grouping,
        baseline_page,
        slide_alias=slide_alias,
    )
    artifact = build_slide_artifact(
        proposal,
        baseline_page,
        slide_alias=slide_alias,
        region_source=GROUPING_REGION_SOURCE,
        pipeline_version=GROUPING_PIPELINE_VERSION,
    )
    return proposal, artifact
