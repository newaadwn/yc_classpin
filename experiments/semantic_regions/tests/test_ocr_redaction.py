from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).parents[1] / "ocr_redaction.py"
SPEC = importlib.util.spec_from_file_location("ocr_redaction", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def tsv_row(
    text: str,
    left: int,
    width: int,
    word_number: int,
    line_number: int = 1,
) -> str:
    return f"5\t1\t1\t1\t{line_number}\t{word_number}\t{left}\t10\t{width}\t20\t95.5\t{text}"


class TesseractParsingTests(unittest.TestCase):
    def test_parses_only_nonempty_word_rows(self) -> None:
        raw = (
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
            "1\t1\t0\t0\t0\t0\t0\t0\t100\t50\t-1\t\n"
            + tsv_row("hello", 10, 40, 1)
            + "\n"
        )
        words = MODULE.parse_tesseract_tsv(raw)
        self.assertEqual(len(words), 1)
        self.assertEqual(words[0]["text"], "hello")
        self.assertEqual(words[0]["bboxPx"], (10, 10, 50, 30))

    def test_rejects_invalid_tsv_shape(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.parse_tesseract_tsv("text\nhello\n")


class DetectionTests(unittest.TestCase):
    def test_detects_email_and_phone_split_across_ocr_words(self) -> None:
        text = "contact user @ example . com or 010 - 1234 - 5678"
        found = [item["type"] for item in MODULE.find_sensitive_spans(text)]
        self.assertEqual(found, ["email", "phone_kr"])

    def test_detects_representative_secret_formats(self) -> None:
        values = {
            "jwt": "eyJabcdefghi.eyJabcdefghijk.abcdefghijklmno",
            "github_token": "ghp_1234567890abcdefghijklmnop",
            "openai_api_key": "sk-proj-1234567890abcdefghijklmnop",
            "google_api_key": "AIza1234567890abcdefghijklmnop",
            "aws_access_key": "AKIA1234567890ABCDEF",
            "uuid": "bdddf9e4-9e8c-473f-8b6d-e0d7dc366d21",
        }
        for expected_type, value in values.items():
            with self.subTest(expected_type=expected_type):
                self.assertEqual(MODULE.find_sensitive_spans(value)[0]["type"], expected_type)

    def test_redacted_text_never_contains_original_value(self) -> None:
        original = "문의: user@example.com"
        redacted, counts = MODULE.redact_text(original)
        self.assertNotIn("user@example.com", redacted)
        self.assertEqual(redacted, "문의: [REDACTED:email]")
        self.assertEqual(counts["email"], 1)

    def test_image_manifest_contains_bbox_but_not_ocr_text(self) -> None:
        words = [
            {
                "index": 0,
                "text": "user",
                "bboxPx": (10, 10, 40, 30),
                "confidence": 95.0,
                "lineKey": (1, 1, 1, 1),
            },
            {
                "index": 1,
                "text": "@",
                "bboxPx": (42, 10, 48, 30),
                "confidence": 95.0,
                "lineKey": (1, 1, 1, 1),
            },
            {
                "index": 2,
                "text": "example.com",
                "bboxPx": (50, 10, 120, 30),
                "confidence": 95.0,
                "lineKey": (1, 1, 1, 1),
            },
        ]
        redactions = MODULE.build_image_redactions(words, 200, 100)
        self.assertEqual(len(redactions), 1)
        self.assertEqual(redactions[0]["type"], "email")
        self.assertNotIn("text", redactions[0])
        self.assertEqual(redactions[0]["bboxNorm"], {"x1": 0.035, "y1": 0.07, "x2": 0.615, "y2": 0.33})


class MaskingAndSafetyTests(unittest.TestCase):
    def test_multiscale_redactions_merge_without_duplicate_masks(self) -> None:
        primary = {
            "type": "email",
            "bboxPx": (10, 10, 80, 30),
            "bboxNorm": {"x1": 0.1, "y1": 0.2, "x2": 0.8, "y2": 0.6},
            "source": "tesseract-ocr",
        }
        secondary = {
            "type": "email",
            "bboxPx": (11, 10, 79, 30),
            "bboxNorm": {"x1": 0.11, "y1": 0.2, "x2": 0.79, "y2": 0.6},
            "source": "tesseract-ocr-grayscale-2x",
        }

        merged = MODULE.merge_image_redactions([primary], [secondary])

        self.assertEqual([primary], merged)

    def test_multiscale_redactions_keep_different_sensitive_values(self) -> None:
        email = {
            "type": "email",
            "bboxPx": (10, 10, 80, 30),
            "bboxNorm": {"x1": 0.1, "y1": 0.2, "x2": 0.4, "y2": 0.3},
            "source": "tesseract-ocr",
        }
        phone = {
            "type": "phone_kr",
            "bboxPx": (100, 10, 180, 30),
            "bboxNorm": {"x1": 0.5, "y1": 0.2, "x2": 0.9, "y2": 0.3},
            "source": "tesseract-ocr-grayscale-2x",
        }

        merged = MODULE.merge_image_redactions([email], [phone])

        self.assertEqual({"email", "phone_kr"}, {item["type"] for item in merged})

    def test_masks_detected_pixels(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.png"
            target = Path(directory) / "target.jpg"
            Image.new("RGB", (100, 50), "white").save(source)
            MODULE.mask_image(
                source,
                target,
                [{"bboxPx": (10, 10, 40, 30), "type": "email"}],
            )
            with Image.open(target) as masked:
                red, green, blue = masked.convert("RGB").getpixel((20, 20))
            self.assertLess(max(red, green, blue), 10)

    def test_partial_or_disabled_redaction_is_never_external_ai_safe(self) -> None:
        self.assertEqual(
            MODULE.redaction_state(True, expected_pages=3, successful_pages=2),
            {"redactionStatus": "failed", "safeForExternalAi": False},
        )
        self.assertEqual(
            MODULE.redaction_state(False, expected_pages=3, successful_pages=0),
            {"redactionStatus": "not-applied", "safeForExternalAi": False},
        )
        self.assertTrue(MODULE.redaction_state(True, 3, 3)["safeForExternalAi"])


if __name__ == "__main__":
    unittest.main()
