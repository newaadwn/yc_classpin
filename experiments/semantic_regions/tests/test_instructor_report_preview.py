from __future__ import annotations

import unittest

from experiments.semantic_regions.render_instructor_report_preview import (
    build_report_data,
    normalize_questions,
    render_html,
)


def question_snapshot() -> dict[str, object]:
    slides = [9, 8, 7, 5, 2, 3, 4, 5, 12, 12, 11, 11, 6, 5, 3, 3, 2]
    return {
        "questions": [
            {
                "questionAlias": f"Q{index:03d}",
                "slideNumber": slide,
                "question": f"질문 {index}",
                "category": "왜 그런가요?",
                "status": "unanswered",
                "kind": "point",
                "coords": {"x": 0.5, "y": 0.5},
            }
            for index, slide in enumerate(slides, start=1)
        ]
    }


class ReportDataTests(unittest.TestCase):
    def test_actual_shape_builds_shared_metrics_and_claims(self) -> None:
        questions = normalize_questions(question_snapshot())

        report = build_report_data(questions)

        self.assertEqual(17, report["scope"]["questions"])
        self.assertEqual(10, report["scope"]["questionSlides"])
        self.assertEqual(17, report["scope"]["unanswered"])
        self.assertEqual(4, len(report["claims"]))

    def test_question_text_is_redacted_before_rendering(self) -> None:
        snapshot = question_snapshot()
        snapshot["questions"][0]["question"] = "문의 user@example.com"

        questions = normalize_questions(snapshot)

        self.assertNotIn("user@example.com", questions[0]["question"])
        self.assertIn("[REDACTED:email]", questions[0]["question"])

    def test_html_escapes_script_closing_sequence_from_untrusted_data(self) -> None:
        report = build_report_data(normalize_questions(question_snapshot()))
        report["material"] = "</script><script>alert(1)</script>"

        rendered = render_html(report, {"8": "assets/slide-008.jpg"})

        self.assertNotIn("</script><script>alert(1)</script>", rendered)
        self.assertIn("<\\/script><script>alert(1)<\\/script>", rendered)


if __name__ == "__main__":
    unittest.main()
