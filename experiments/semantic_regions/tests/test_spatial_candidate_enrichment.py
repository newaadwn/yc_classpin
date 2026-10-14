from __future__ import annotations

import copy
import unittest

from experiments.semantic_regions.semantic_grouping import GroupingValidationError
from experiments.semantic_regions.spatial_candidate_enrichment import (
    apply_grounding_quality_gate,
    build_spatial_candidates,
    merge_enrichment,
    validate_enrichment,
)


def region(alias: str, order: int, x: float, y: float, text: str) -> dict[str, object]:
    return {
        "alias": alias,
        "type": "title" if y < 0.15 else "paragraph",
        "readingOrder": order,
        "bboxNorm": {"x1": x, "y1": y, "x2": x + 0.1, "y2": y + 0.05},
        "textRedacted": text,
        "confidence": 0.9,
    }


def page() -> dict[str, object]:
    return {
        "regions": [
            region("R001", 1, 0.05, 0.03, "전체 제목"),
            region("R002", 2, 0.08, 0.30, "왼쪽 문제"),
            region("R003", 3, 0.20, 0.55, "왼쪽 근거"),
            region("R004", 4, 0.65, 0.30, "오른쪽 해결"),
            region("R005", 5, 0.75, 0.65, "오른쪽 효과"),
            region("R006", 6, 0.95, 0.95, "!"),
        ]
    }


def enrichment(aliases: list[str]) -> dict[str, object]:
    return {
        "schemaVersion": "semantic-region-enrichment.v1",
        "promptVersion": "semantic-region-enrichment.v1",
        "slideAlias": "S008",
        "slideSummary": "문제와 해결 방안을 비교한다.",
        "keyConcepts": ["문제", "해결"],
        "regions": [
            {
                "candidateAlias": alias,
                "type": "title" if index == 0 else "paragraph",
                "summary": f"후보 {index + 1}",
                "concepts": ["개념"],
                "importance": "high" if index == 0 else "medium",
                "confidence": 0.8,
            }
            for index, alias in enumerate(aliases)
        ],
    }


class SpatialCandidateTests(unittest.TestCase):
    def test_code_partitions_every_ocr_alias(self) -> None:
        grouping, candidates = build_spatial_candidates(page(), slide_alias="S008")

        grouped = {alias for group in grouping["groups"] for alias in group["memberAliases"]}
        ignored = set(grouping["ignoredMemberAliases"])
        self.assertEqual({f"R{index:03d}" for index in range(1, 7)}, grouped | ignored)
        self.assertFalse(grouped & ignored)
        self.assertEqual(len(grouping["groups"]), len(candidates))

    def test_model_cannot_change_candidate_membership(self) -> None:
        grouping, candidates = build_spatial_candidates(page(), slide_alias="S008")
        raw = enrichment([candidate["candidateAlias"] for candidate in candidates])

        merged = merge_enrichment(grouping, raw, candidates)

        self.assertEqual(
            [group["memberAliases"] for group in grouping["groups"]],
            [group["memberAliases"] for group in merged["groups"]],
        )

    def test_duplicate_candidate_is_rejected(self) -> None:
        _, candidates = build_spatial_candidates(page(), slide_alias="S008")
        aliases = [candidate["candidateAlias"] for candidate in candidates]
        raw = enrichment(aliases)
        raw["regions"][1]["candidateAlias"] = aliases[0]

        with self.assertRaisesRegex(GroupingValidationError, "duplicated"):
            validate_enrichment(raw, expected_slide_alias="S008", candidate_aliases=aliases)

    def test_sensitive_summary_is_rejected(self) -> None:
        _, candidates = build_spatial_candidates(page(), slide_alias="S008")
        aliases = [candidate["candidateAlias"] for candidate in candidates]
        raw = copy.deepcopy(enrichment(aliases))
        raw["slideSummary"] = "user@example.com 문의"

        with self.assertRaisesRegex(GroupingValidationError, "sensitive"):
            validate_enrichment(raw, expected_slide_alias="S008", candidate_aliases=aliases)

    def test_generic_model_output_is_downgraded(self) -> None:
        _, candidates = build_spatial_candidates(page(), slide_alias="S008")
        aliases = [candidate["candidateAlias"] for candidate in candidates]
        raw = enrichment(aliases)
        raw["regions"][1]["summary"] = "강의 주제를 설명한다"
        validated = validate_enrichment(raw, expected_slide_alias="S008", candidate_aliases=aliases)

        grounded, warnings = apply_grounding_quality_gate(validated, candidates)

        self.assertEqual("other", grounded["regions"][1]["type"])
        self.assertLessEqual(grounded["regions"][1]["confidence"], 0.3)
        self.assertEqual("generic-semantic-output", warnings[0]["reason"])


if __name__ == "__main__":
    unittest.main()
