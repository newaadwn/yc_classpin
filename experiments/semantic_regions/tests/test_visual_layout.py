import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_visual_layout import normalized_box, attach_ocr
from enrich_visual_layout import meaning_schema
from compare_meaning_models import quality_issues
import jsonschema


class VisualLayoutTests(unittest.TestCase):
    def test_box_coordinates(self):
        self.assertEqual(normalized_box([-1, 0, 101, 50], 100, 100),
                         {"x1": 0, "y1": 0, "x2": 1, "y2": .5})

    def test_invalid_box(self):
        for box in ([0, 0, math.nan, 1], [2, 2, 1, 1], [0, 0, 0, 1]):
            with self.assertRaises(ValueError):
                normalized_box(box, 100, 100)

    def test_ocr_only_inside_and_redacted(self):
        regions = [{"alias": "R001", "bboxNorm": {"x1": .1, "y1": .1, "x2": .2, "y2": .2},
                    "text": "DO NOT COPY", "textRedacted": "safe", "readingOrder": 1}]
        self.assertEqual(attach_ocr({"x1": 0, "y1": 0, "x2": .5, "y2": .5}, regions), ("safe", ["R001"]))
        self.assertEqual(attach_ocr({"x1": .5, "y1": .5, "x2": 1, "y2": 1}, regions), ("", []))

    def test_model_cannot_move_geometry_or_change_alias(self):
        valid = {"regionAlias": "R001", "meaning": "observed", "uncertainty": "review"}
        jsonschema.validate(valid, meaning_schema("R001"))
        for invalid in ({**valid, "bboxNorm": {}}, {**valid, "regionAlias": "R002"}):
            with self.assertRaises(jsonschema.ValidationError):
                jsonschema.validate(invalid, meaning_schema("R001"))

    def test_unsupported_quote_and_number_are_blocked(self):
        issues = quality_issues({"quote": "invented", "meaning": "growth 185%"}, "growth 18%")
        self.assertEqual(issues, ["quote-not-in-source", "unsupported-number"])

    def test_exact_quote_is_only_a_mechanical_gate(self):
        self.assertEqual(quality_issues({"quote": "growth", "meaning": "growth"}, "growth 18%"), [])


if __name__ == "__main__":
    unittest.main()
