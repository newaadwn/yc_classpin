from __future__ import annotations

import unittest

from experiments.semantic_regions.publish_classpin_report import build_report_bundle


class PublishClassPinReportTests(unittest.TestCase):
    def test_builds_redacted_web_bundle_with_question_context(self) -> None:
        run = {
            "slideAlias": "S008",
            "inputElementCount": 4,
            "semanticRegionCount": 1,
            "ignoredElementCount": 3,
            "model": {"name": "local-model", "license": "Apache-2.0"},
            "metrics": {"elapsedMs": 1200, "peakProcessTreeRssMb": 256},
            "semanticEnrichment": {"slideSummary": "요약", "keyConcepts": ["핵심"]},
            "semanticQualityWarnings": [],
            "pinMappings": [{"questionAlias": "Q001", "mappingStatus": "mapped"}],
            "pinSemanticAnalyses": [{
                "questionAlias": "Q001",
                "regionAlias": "R001",
                "relation": "requests_evidence",
                "analysis": "근거를 요청합니다.",
                "instructorAction": "출처를 보강하세요.",
                "confidence": 0.8,
            }],
            "artifact": {"regions": [{"alias": "R001", "type": "title"}]},
        }
        questions = {"questions": [{
            "questionAlias": "Q001",
            "slideNumber": 8,
            "question": "근거가 있나요?",
            "category": "왜 그런가요?",
        }]}

        bundle = build_report_bundle(
            run,
            questions,
            session_id="3373b744-a42f-4e89-b71e-07ffe1b3b245",
            slide_number=8,
        )

        self.assertEqual("classpin-local-ai-report.v1", bundle["schemaVersion"])
        self.assertEqual("근거가 있나요?", bundle["pins"][0]["question"])
        self.assertEqual("mapped", bundle["pins"][0]["mappingStatus"])
        self.assertEqual("slide-008.semantic-overlay.jpg", bundle["image"])

    def test_rejects_non_uuid_session_id(self) -> None:
        with self.assertRaises(ValueError):
            build_report_bundle(
                {
                    "slideAlias": "S001",
                    "inputElementCount": 0,
                    "semanticRegionCount": 0,
                    "ignoredElementCount": 0,
                    "model": {"name": "local", "license": "Apache-2.0"},
                    "metrics": {"elapsedMs": 0, "peakProcessTreeRssMb": 0},
                    "semanticEnrichment": {"slideSummary": "", "keyConcepts": []},
                    "artifact": {"regions": []},
                },
                {"questions": []},
                session_id="../outside",
                slide_number=1,
            )


if __name__ == "__main__":
    unittest.main()
