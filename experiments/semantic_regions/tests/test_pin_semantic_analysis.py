from __future__ import annotations

import unittest

from experiments.semantic_regions.pin_semantic_analysis import (
    PinSemanticValidationError,
    apply_pin_semantic_quality_gate,
    validate_pin_semantic_analysis,
)


def valid() -> dict[str, object]:
    return {
        "schemaVersion": "pin-semantic-analysis.v1",
        "questionAlias": "Q002",
        "regionAlias": "R005",
        "relation": "suggests_improvement",
        "analysis": "AI 이미지 대신 실제 프로토타입 근거를 요구한다.",
        "instructorAction": "프로토타입 제작 범위와 검증 계획을 보강한다.",
        "confidence": 0.9,
    }


class PinSemanticAnalysisTests(unittest.TestCase):
    def test_valid_analysis_keeps_trusted_aliases(self) -> None:
        result = validate_pin_semantic_analysis(valid(), question_alias="Q002", region_alias="R005")

        self.assertEqual(("Q002", "R005"), (result["questionAlias"], result["regionAlias"]))

    def test_model_cannot_change_region_alias(self) -> None:
        raw = valid()
        raw["regionAlias"] = "R999"

        with self.assertRaisesRegex(PinSemanticValidationError, "does not match"):
            validate_pin_semantic_analysis(raw, question_alias="Q002", region_alias="R005")

    def test_sensitive_generated_action_is_rejected(self) -> None:
        raw = valid()
        raw["instructorAction"] = "user@example.com으로 연락"

        with self.assertRaisesRegex(PinSemanticValidationError, "sensitive"):
            validate_pin_semantic_analysis(raw, question_alias="Q002", region_alias="R005")

    def test_echoed_ocr_is_replaced_with_grounded_action(self) -> None:
        raw = valid()
        raw["analysis"] = "R005 OCR 텍스트를 그대로 반복"
        validated = validate_pin_semantic_analysis(raw, question_alias="Q002", region_alias="R005")

        grounded, warning = apply_pin_semantic_quality_gate(
            validated,
            question_text="AI 이미지보다 실제 프로토타입이 낫지 않을까요?",
            region_summary="K-POP 커뮤니티 확장 예시",
        )

        self.assertIn("실제 프로토타입", grounded["analysis"])
        self.assertIn("사용자 검증 계획", grounded["instructorAction"])
        self.assertEqual("echo-or-generic-output-normalized", warning)


if __name__ == "__main__":
    unittest.main()
