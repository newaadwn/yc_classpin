from __future__ import annotations

import unittest

from experiments.semantic_regions.render_local_semantic_report import render_html


class LocalSemanticReportTests(unittest.TestCase):
    def test_untrusted_semantic_text_is_html_escaped(self) -> None:
        run = {
            "slideAlias": "S008",
            "inputElementCount": 1,
            "semanticRegionCount": 1,
            "ignoredElementCount": 0,
            "model": {"name": "local", "license": "Apache-2.0"},
            "metrics": {"elapsedMs": 1000, "peakProcessTreeRssMb": 512},
            "semanticEnrichment": {"slideSummary": "<script>alert(1)</script>", "keyConcepts": []},
            "semanticQualityWarnings": [],
            "pinMappings": [],
            "pinSemanticAnalyses": [],
            "artifact": {"regions": [{"alias": "R001", "type": "title", "summary": "안전한 제목", "concepts": [], "confidence": 0.9, "bboxNorm": {"x1": 0.1, "y1": 0.1, "x2": 0.2, "y2": 0.2}}]},
        }

        rendered = render_html(run, {"questions": []})

        self.assertNotIn("<script>alert(1)</script>", rendered)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", rendered)


if __name__ == "__main__":
    unittest.main()
