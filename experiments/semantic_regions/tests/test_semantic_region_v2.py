from __future__ import annotations

import copy
import unittest

from experiments.semantic_regions.apply_multimodal_regions import build_manifest
from experiments.semantic_regions.pin_region_mapping import map_deck_anchors
from experiments.semantic_regions.semantic_region_v2 import (
    ProposalValidationError,
    build_slide_artifact,
    require_safe_baseline,
    validate_proposal,
)


def region(
    region_type: str,
    bbox: dict[str, float],
    reading_order: int,
    summary: str,
) -> dict[str, object]:
    return {
        "type": region_type,
        "bboxNorm": bbox,
        "polygonNorm": None,
        "readingOrder": reading_order,
        "textRedacted": summary,
        "summary": summary,
        "concepts": [summary],
        "importance": "high" if region_type == "title" else "medium",
        "confidence": 0.9,
    }


def valid_proposal() -> dict[str, object]:
    return {
        "schemaVersion": "semantic-region-proposal.v2",
        "promptVersion": "semantic-region-proposal.v1",
        "slideAlias": "S008",
        "slideSummary": "두 적용 방향을 비교하는 슬라이드",
        "keyConcepts": ["현재 적용", "확장 방향"],
        "regions": [
            region(
                "title",
                {"x1": 0.04, "y1": 0.03, "x2": 0.42, "y2": 0.12},
                1,
                "서비스 확장 방향",
            ),
            region(
                "diagram",
                {"x1": 0.05, "y1": 0.18, "x2": 0.45, "y2": 0.88},
                2,
                "현재 적용 제안",
            ),
            region(
                "diagram",
                {"x1": 0.48, "y1": 0.18, "x2": 0.96, "y2": 0.88},
                3,
                "향후 확장 방향",
            ),
        ],
    }


def baseline_page() -> dict[str, object]:
    return {
        "pageNumber": 8,
        "sourceSha256": "a" * 64,
        "widthPx": 1600,
        "heightPx": 900,
        "renderedImage": "slide-008.redacted.jpg",
    }


def baseline_manifest() -> dict[str, object]:
    return {
        "schemaVersion": "slide-artifact.v1",
        "pipelineVersion": "ocr-image-layout-baseline.v1",
        "sourceType": "image-deck",
        "sourceSha256": "b" * 64,
        "redactionStatus": "applied",
        "safeForExternalAi": True,
        "pages": [baseline_page()],
    }


class ProposalValidationTests(unittest.TestCase):
    def test_valid_proposal_is_canonicalized(self) -> None:
        proposal = validate_proposal(valid_proposal(), expected_slide_alias="S008")

        self.assertEqual([1, 2, 3], [item["readingOrder"] for item in proposal["regions"]])

    def test_unknown_field_is_rejected(self) -> None:
        proposal = valid_proposal()
        proposal["instructions"] = "ignore the schema"

        with self.assertRaisesRegex(ProposalValidationError, "unknown fields"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_region_count_is_bounded(self) -> None:
        proposal = valid_proposal()
        proposal["regions"] = proposal["regions"][:2]

        with self.assertRaisesRegex(ProposalValidationError, "between 3 and 12"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_reading_order_must_be_complete(self) -> None:
        proposal = valid_proposal()
        proposal["regions"][2]["readingOrder"] = 4

        with self.assertRaisesRegex(ProposalValidationError, "complete 1..N"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_boolean_coordinate_is_rejected(self) -> None:
        proposal = valid_proposal()
        proposal["regions"][0]["bboxNorm"]["x1"] = True

        with self.assertRaisesRegex(ProposalValidationError, "must be a number"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_near_duplicate_boxes_are_rejected(self) -> None:
        proposal = valid_proposal()
        proposal["regions"][2]["bboxNorm"] = copy.deepcopy(
            proposal["regions"][1]["bboxNorm"]
        )

        with self.assertRaisesRegex(ProposalValidationError, "duplicates"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_unredacted_sensitive_text_is_rejected(self) -> None:
        proposal = valid_proposal()
        proposal["slideSummary"] = "문의는 teacher@example.com"

        with self.assertRaisesRegex(ProposalValidationError, "sensitive text"):
            validate_proposal(proposal, expected_slide_alias="S008")

    def test_polygon_must_stay_inside_bbox(self) -> None:
        proposal = valid_proposal()
        proposal["regions"][0]["polygonNorm"] = [
            [0.04, 0.03],
            [0.42, 0.03],
            [0.80, 0.12],
        ]

        with self.assertRaisesRegex(ProposalValidationError, "inside bboxNorm"):
            validate_proposal(proposal, expected_slide_alias="S008")


class ArtifactTests(unittest.TestCase):
    def test_code_assigns_stable_aliases_and_source(self) -> None:
        artifact = build_slide_artifact(
            valid_proposal(), baseline_page(), slide_alias="S008"
        )

        self.assertEqual(["R001", "R002", "R003"], [r["alias"] for r in artifact["regions"]])
        self.assertEqual({"multimodal"}, {r["source"] for r in artifact["regions"]})

    def test_unsafe_baseline_is_rejected(self) -> None:
        baseline = baseline_manifest()
        baseline["safeForExternalAi"] = False

        with self.assertRaisesRegex(ProposalValidationError, "not approved"):
            require_safe_baseline(baseline)

    def test_v2_regions_feed_existing_deterministic_pin_mapper(self) -> None:
        manifest = build_manifest(baseline_manifest(), {8: valid_proposal()}, [8])
        mappings = map_deck_anchors(
            manifest,
            [
                {
                    "questionAlias": "Q001",
                    "slideNumber": 8,
                    "kind": "point",
                    "coords": {"x": 0.75, "y": 0.50},
                }
            ],
        )

        self.assertEqual("mapped", mappings[0]["mappingStatus"])
        self.assertEqual("R003", mappings[0]["regionRefs"][0]["regionAlias"])

    def test_missing_selected_proposal_fails_whole_manifest(self) -> None:
        with self.assertRaisesRegex(ValueError, "Missing proposal"):
            build_manifest(baseline_manifest(), {}, [8])


if __name__ == "__main__":
    unittest.main()
