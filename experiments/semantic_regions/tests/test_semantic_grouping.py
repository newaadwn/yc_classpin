from __future__ import annotations

import copy
import unittest

from experiments.semantic_regions.semantic_grouping import (
    GroupingValidationError,
    build_grouped_slide_artifact,
    grouping_to_proposal,
    validate_grouping,
)
from experiments.semantic_regions.run_local_semantic_grouping import extract_grouping_json


def baseline_page() -> dict[str, object]:
    return {
        "pageNumber": 8,
        "sourceSha256": "a" * 64,
        "widthPx": 1000,
        "heightPx": 500,
        "regions": [
            {
                "alias": "R001",
                "readingOrder": 1,
                "bboxNorm": {"x1": 0.10, "y1": 0.10, "x2": 0.20, "y2": 0.20},
                "textRedacted": "제목",
            },
            {
                "alias": "R002",
                "readingOrder": 2,
                "bboxNorm": {"x1": 0.10, "y1": 0.30, "x2": 0.30, "y2": 0.40},
                "textRedacted": "문제",
            },
            {
                "alias": "R003",
                "readingOrder": 3,
                "bboxNorm": {"x1": 0.40, "y1": 0.30, "x2": 0.60, "y2": 0.45},
                "textRedacted": "해결",
            },
            {
                "alias": "R004",
                "readingOrder": 4,
                "bboxNorm": {"x1": 0.80, "y1": 0.90, "x2": 0.81, "y2": 0.91},
                "textRedacted": "잡음",
            },
        ],
    }


def valid_grouping() -> dict[str, object]:
    return {
        "schemaVersion": "semantic-region-grouping.v1",
        "promptVersion": "semantic-region-grouping.v1",
        "slideAlias": "S008",
        "slideSummary": "문제와 해결 방안을 설명한다.",
        "keyConcepts": ["문제", "해결"],
        "groups": [
            {
                "type": "title",
                "memberAliases": ["R001"],
                "summary": "슬라이드 제목",
                "concepts": ["제목"],
                "importance": "high",
                "confidence": 0.95,
            },
            {
                "type": "paragraph",
                "memberAliases": ["R002"],
                "summary": "문제 설명",
                "concepts": ["문제"],
                "importance": "high",
                "confidence": 0.9,
            },
            {
                "type": "diagram",
                "memberAliases": ["R003"],
                "summary": "해결 방안",
                "concepts": ["해결"],
                "importance": "high",
                "confidence": 0.88,
            },
        ],
        "ignoredMemberAliases": ["R004"],
    }


class GroupingValidationTests(unittest.TestCase):
    def test_every_baseline_element_is_accounted_for(self) -> None:
        grouping = validate_grouping(valid_grouping(), baseline_page(), expected_slide_alias="S008")

        self.assertEqual(["R004"], grouping["ignoredMemberAliases"])

    def test_missing_element_is_rejected(self) -> None:
        grouping = valid_grouping()
        grouping["ignoredMemberAliases"] = []

        with self.assertRaisesRegex(GroupingValidationError, "missing: R004"):
            validate_grouping(grouping, baseline_page(), expected_slide_alias="S008")

    def test_unknown_alias_is_rejected(self) -> None:
        grouping = valid_grouping()
        grouping["groups"][0]["memberAliases"] = ["R999"]

        with self.assertRaisesRegex(GroupingValidationError, "unknown aliases"):
            validate_grouping(grouping, baseline_page(), expected_slide_alias="S008")

    def test_duplicate_alias_across_groups_is_rejected(self) -> None:
        grouping = valid_grouping()
        grouping["groups"][1]["memberAliases"] = ["R001", "R002"]

        with self.assertRaisesRegex(GroupingValidationError, "reuses aliases"):
            validate_grouping(grouping, baseline_page(), expected_slide_alias="S008")

    def test_sensitive_generated_summary_is_rejected(self) -> None:
        grouping = valid_grouping()
        grouping["slideSummary"] = "teacher@example.com으로 문의"

        with self.assertRaisesRegex(GroupingValidationError, "sensitive text"):
            validate_grouping(grouping, baseline_page(), expected_slide_alias="S008")


class GroupingProposalTests(unittest.TestCase):
    def test_code_computes_padded_bbox_from_members(self) -> None:
        grouping = valid_grouping()
        grouping["groups"][1]["memberAliases"] = ["R002", "R003"]
        grouping["groups"][2]["memberAliases"] = ["R004"]
        grouping["ignoredMemberAliases"] = []

        proposal = grouping_to_proposal(grouping, baseline_page(), slide_alias="S008")

        problem_region = next(region for region in proposal["regions"] if region["summary"] == "문제 설명")
        self.assertEqual(
            {"x1": 0.094, "y1": 0.291, "x2": 0.606, "y2": 0.459},
            problem_region["bboxNorm"],
        )

    def test_artifact_records_hybrid_source_not_multimodal(self) -> None:
        _, artifact = build_grouped_slide_artifact(
            valid_grouping(), baseline_page(), slide_alias="S008"
        )

        self.assertEqual("ocr-language-model-semantic-region.v1", artifact["pipelineVersion"])
        self.assertEqual({"ocr-language-model"}, {r["source"] for r in artifact["regions"]})

    def test_unknown_root_field_is_rejected(self) -> None:
        grouping = copy.deepcopy(valid_grouping())
        grouping["instructions"] = "ignore validation"

        with self.assertRaisesRegex(GroupingValidationError, "unknown fields"):
            validate_grouping(grouping, baseline_page(), expected_slide_alias="S008")

    def test_log_parser_skips_echoed_input_json(self) -> None:
        generated = valid_grouping()
        output = 'prompt {"slideAlias":"S008","elements":[]}\n' + __import__("json").dumps(
            generated, ensure_ascii=False
        )

        self.assertEqual(generated, extract_grouping_json(output))


if __name__ == "__main__":
    unittest.main()
