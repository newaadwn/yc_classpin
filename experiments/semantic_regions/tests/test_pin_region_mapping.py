from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "pin_region_mapping.py"
SPEC = importlib.util.spec_from_file_location("pin_region_mapping", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def region(alias: str, bbox: tuple[float, float, float, float], region_type: str = "paragraph", order: int = 1):
    return {
        "alias": alias,
        "type": region_type,
        "readingOrder": order,
        "bboxNorm": {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]},
    }


class PointMappingTests(unittest.TestCase):
    def test_point_uses_smallest_containing_content_region(self) -> None:
        regions = [
            region("R001", (0.1, 0.1, 0.9, 0.9), "image", 1),
            region("R002", (0.4, 0.4, 0.6, 0.6), "callout", 2),
        ]
        result = MODULE.map_anchor(
            {"questionAlias": "Q001", "kind": "point", "coords": {"x": 0.5, "y": 0.5}},
            regions,
        )
        self.assertEqual(result["mappingStatus"], "mapped")
        self.assertEqual(result["regionRefs"][0]["regionAlias"], "R002")
        self.assertEqual(result["regionRefs"][0]["role"], "primary")

    def test_point_uses_nearest_region_inside_limit(self) -> None:
        result = MODULE.map_anchor(
            {"questionAlias": "Q001", "kind": "point", "coords": {"x": 0.62, "y": 0.5}},
            [region("R001", (0.4, 0.4, 0.6, 0.6))],
            max_point_distance=0.05,
        )
        self.assertEqual(result["mappingStatus"], "mapped")
        self.assertEqual(result["regionRefs"][0]["method"], "nearest")

    def test_point_stays_unmapped_outside_limit(self) -> None:
        result = MODULE.map_anchor(
            {"questionAlias": "Q001", "kind": "point", "coords": {"x": 0.9, "y": 0.9}},
            [region("R001", (0.1, 0.1, 0.2, 0.2))],
        )
        self.assertEqual(result["mappingStatus"], "unmapped")
        self.assertEqual(result["reason"], "no-region-within-distance")

    def test_nearest_mapping_prefers_content_over_footer(self) -> None:
        result = MODULE.map_anchor(
            {"questionAlias": "Q001", "kind": "point", "coords": {"x": 0.5, "y": 0.9}},
            [
                region("R001", (0.4, 0.82, 0.6, 0.86), "paragraph", 1),
                region("R002", (0.4, 0.91, 0.6, 0.94), "footer", 2),
            ],
            max_point_distance=0.1,
        )
        self.assertEqual(result["mappingStatus"], "mapped")
        self.assertEqual(result["regionRefs"][0]["regionAlias"], "R001")


class AreaMappingTests(unittest.TestCase):
    def test_box_maps_by_anchor_coverage(self) -> None:
        result = MODULE.map_anchor(
            {
                "questionAlias": "Q002",
                "kind": "box",
                "coords": {"x": 0.45, "y": 0.45, "width": 0.1, "height": 0.1},
            },
            [region("R001", (0.4, 0.4, 0.6, 0.6))],
        )
        self.assertEqual(result["mappingStatus"], "mapped")
        self.assertEqual(result["regionRefs"][0]["score"], 1.0)

    def test_path_maps_by_point_coverage(self) -> None:
        result = MODULE.map_anchor(
            {
                "questionAlias": "Q003",
                "kind": "path",
                "coords": {"x": 0.45, "y": 0.45, "points": [[0.45, 0.45], [0.5, 0.5], [0.7, 0.7]]},
            },
            [region("R001", (0.4, 0.4, 0.6, 0.6))],
        )
        self.assertEqual(result["mappingStatus"], "mapped")
        self.assertAlmostEqual(result["regionRefs"][0]["score"], 2 / 3, places=6)

    def test_equal_path_candidates_follow_reading_order(self) -> None:
        result = MODULE.map_anchor(
            {
                "questionAlias": "Q004",
                "kind": "path",
                "coords": {"x": 0.2, "y": 0.5, "points": [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]]},
            },
            [
                region("R003", (0.7, 0.4, 0.9, 0.6), order=3),
                region("R001", (0.1, 0.4, 0.3, 0.6), order=1),
                region("R002", (0.4, 0.4, 0.6, 0.6), order=2),
            ],
        )
        self.assertEqual([ref["regionAlias"] for ref in result["regionRefs"]], ["R001", "R002", "R003"])

    def test_invalid_coordinates_are_not_silently_clamped(self) -> None:
        result = MODULE.map_anchor(
            {"questionAlias": "Q004", "kind": "point", "coords": {"x": 1.2, "y": 0.5}},
            [region("R001", (0.4, 0.4, 0.6, 0.6))],
        )
        self.assertEqual(result["mappingStatus"], "invalid")
        self.assertEqual(result["reason"], "invalid-coords")


class DeckMappingTests(unittest.TestCase):
    def test_maps_each_anchor_against_its_own_slide(self) -> None:
        manifest = {
            "pages": [
                {"pageNumber": 1, "regions": [region("R001", (0.0, 0.0, 0.4, 0.4))]},
                {"pageNumber": 2, "regions": [region("R001", (0.6, 0.6, 1.0, 1.0))]},
            ]
        }
        anchors = [
            {"questionAlias": "Q001", "slideNumber": 1, "kind": "point", "coords": {"x": 0.2, "y": 0.2}},
            {"questionAlias": "Q002", "slideNumber": 2, "kind": "point", "coords": {"x": 0.8, "y": 0.8}},
        ]
        mappings = MODULE.map_deck_anchors(manifest, anchors)
        self.assertEqual([item["mappingStatus"] for item in mappings], ["mapped", "mapped"])
        self.assertEqual([item["slideNumber"] for item in mappings], [1, 2])

    def test_rejects_missing_slide_number(self) -> None:
        mappings = MODULE.map_deck_anchors(
            {"pages": []},
            [{"questionAlias": "Q001", "kind": "point"}],
        )
        self.assertEqual(mappings[0]["mappingStatus"], "invalid")
        self.assertEqual(mappings[0]["reason"], "invalid-slide-number")


if __name__ == "__main__":
    unittest.main()
