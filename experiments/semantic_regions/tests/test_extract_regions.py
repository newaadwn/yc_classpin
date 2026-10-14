from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "extract_regions.py"
SPEC = importlib.util.spec_from_file_location("extract_regions", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GeometryTests(unittest.TestCase):
    def test_normalize_bbox_clamps_to_page(self) -> None:
        self.assertEqual(
            MODULE.normalize_bbox((-10.0, 10.0, 110.0, 60.0), 100.0, 100.0),
            {"x1": 0.0, "y1": 0.1, "x2": 1.0, "y2": 0.6},
        )

    def test_choose_smallest_container_is_deterministic(self) -> None:
        subject = (45.0, 45.0, 55.0, 55.0)
        outer = (0.0, 0.0, 100.0, 100.0)
        inner = (40.0, 40.0, 60.0, 60.0)
        self.assertEqual(MODULE.choose_smallest_container(subject, [outer, inner]), inner)
        self.assertEqual(MODULE.choose_smallest_container(subject, [inner, outer]), inner)

    def test_visual_bbox_rejects_page_background_and_thin_border(self) -> None:
        self.assertFalse(MODULE.is_usable_visual_bbox((0.0, 0.0, 960.0, 540.0), 960.0, 540.0))
        self.assertFalse(MODULE.is_usable_visual_bbox((0.0, 0.0, 12.0, 540.0), 960.0, 540.0))
        self.assertTrue(MODULE.is_usable_visual_bbox((50.0, 270.0, 320.0, 400.0), 960.0, 540.0))

    def test_words_are_grouped_into_a_stable_line(self) -> None:
        words = [
            {"index": 1, "text": "두", "bbox": (40.0, 20.2, 50.0, 30.2), "font_size": 10.0, "font_name": "Body"},
            {"index": 0, "text": "하나", "bbox": (10.0, 20.0, 30.0, 30.0), "font_size": 10.0, "font_name": "Body"},
        ]
        self.assertEqual(MODULE.group_words_into_lines(words)[0]["text"], "하나 두")


class ClassificationTests(unittest.TestCase):
    def test_large_upper_text_is_title(self) -> None:
        self.assertEqual(
            MODULE.classify_text_region(
                "운영의 기본",
                (40.0, 50.0, 500.0, 90.0),
                26.0,
                12.0,
                540.0,
            ),
            "title",
        )

    def test_bottom_text_is_footer(self) -> None:
        self.assertEqual(
            MODULE.classify_text_region(
                "17차시 LLMOps",
                (40.0, 510.0, 200.0, 520.0),
                10.0,
                12.0,
                540.0,
            ),
            "footer",
        )

    def test_code_font_is_code(self) -> None:
        self.assertEqual(
            MODULE.classify_text_region(
                "from langfuse import observe",
                (40.0, 180.0, 600.0, 220.0),
                13.0,
                12.0,
                540.0,
                ["LiberationMono"],
            ),
            "code",
        )


if __name__ == "__main__":
    unittest.main()
