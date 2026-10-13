from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).parents[1] / "extract_image_regions.py"
SPEC = importlib.util.spec_from_file_location("extract_image_regions", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def word(
    index: int,
    text: str,
    bbox: tuple[int, int, int, int],
    line: int,
    block: int = 1,
) -> dict[str, object]:
    return {
        "index": index,
        "text": text,
        "bboxPx": bbox,
        "confidence": 95.0,
        "lineKey": (1, block, 1, line),
    }


class ImageDiscoveryTests(unittest.TestCase):
    def test_discovers_supported_images_in_filename_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.new("RGB", (10, 10), "white").save(root / "slide-002.jpg")
            Image.new("RGB", (10, 10), "white").save(root / "slide-001.png")
            (root / "notes.txt").write_text("ignored", encoding="utf-8")
            self.assertEqual(
                [path.name for path in MODULE.discover_images(root)],
                ["slide-001.png", "slide-002.jpg"],
            )


class OcrRegionTests(unittest.TestCase):
    def test_builds_stable_title_and_paragraph_regions(self) -> None:
        words = [
            word(0, "SOi", (50, 40, 150, 90), 1, block=1),
            word(1, "소이", (160, 40, 260, 90), 1, block=1),
            word(2, "이미지", (50, 180, 110, 205), 2, block=2),
            word(3, "태깅", (120, 180, 180, 205), 2, block=2),
        ]
        regions = MODULE.build_ocr_regions(words, 1000, 600)
        self.assertEqual([region["alias"] for region in regions], ["R001", "R002"])
        self.assertEqual(regions[0]["type"], "title")
        self.assertEqual(regions[1]["type"], "paragraph")

    def test_merges_nearby_aligned_lines(self) -> None:
        words = [
            word(0, "첫째", (50, 180, 100, 205), 1),
            word(1, "둘째", (50, 215, 100, 240), 2),
        ]
        lines = MODULE.words_to_lines(words)
        groups = MODULE.merge_adjacent_lines(lines, 1000)
        self.assertEqual(len(groups), 1)

    def test_region_text_is_redacted(self) -> None:
        words = [word(0, "user@example.com", (50, 180, 260, 210), 1)]
        region = MODULE.build_ocr_regions(words, 1000, 600)[0]
        self.assertNotIn("user@example.com", region["text"])
        self.assertEqual(region["textRedacted"], "[REDACTED:email]")


if __name__ == "__main__":
    unittest.main()
