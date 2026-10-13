from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from experiments.semantic_regions.extract_regions import draw_overlay, require_empty_output
    from experiments.semantic_regions.pin_region_mapping import map_deck_anchors
    from experiments.semantic_regions.semantic_region_v2 import (
        ARTIFACT_SCHEMA_VERSION,
        PIPELINE_VERSION,
        build_slide_artifact,
        require_safe_baseline,
        select_pages,
    )
except ModuleNotFoundError:
    from extract_regions import draw_overlay, require_empty_output  # type: ignore[no-redef]
    from pin_region_mapping import map_deck_anchors  # type: ignore[no-redef]
    from semantic_region_v2 import (  # type: ignore[no-redef]
        ARTIFACT_SCHEMA_VERSION,
        PIPELINE_VERSION,
        build_slide_artifact,
        require_safe_baseline,
        select_pages,
    )


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_manifest(
    baseline_manifest: dict[str, Any],
    proposals: dict[int, Any],
    page_numbers: list[int],
) -> dict[str, Any]:
    require_safe_baseline(baseline_manifest)
    pages = select_pages(baseline_manifest, page_numbers)
    artifacts: list[dict[str, Any]] = []
    for page in pages:
        page_number = page["pageNumber"]
        if page_number not in proposals:
            raise ValueError(f"Missing proposal for page {page_number}.")
        artifacts.append(
            build_slide_artifact(
                proposals[page_number],
                page,
                slide_alias=f"S{page_number:03d}",
            )
        )

    region_counts = Counter(
        region["type"]
        for artifact in artifacts
        for region in artifact["regions"]
    )
    return {
        "schemaVersion": ARTIFACT_SCHEMA_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "sourceType": baseline_manifest.get("sourceType"),
        "sourceSha256": baseline_manifest.get("sourceSha256"),
        "sourcePipelineVersion": baseline_manifest.get("pipelineVersion"),
        "redactionStatus": baseline_manifest.get("redactionStatus"),
        "safeForExternalAi": baseline_manifest.get("safeForExternalAi"),
        "analyzedPageCount": len(artifacts),
        "regionCount": sum(region_counts.values()),
        "regionCountByType": dict(sorted(region_counts.items())),
        "pages": artifacts,
    }


def write_outputs(
    manifest: dict[str, Any],
    baseline_manifest: dict[str, Any],
    baseline_dir: Path,
    output_dir: Path,
    anchors: list[dict[str, Any]] | None,
) -> None:
    pages_by_number = {
        page["pageNumber"]: page for page in baseline_manifest.get("pages") or []
    }
    for artifact in manifest["pages"]:
        page_number = artifact["pageNumber"]
        baseline_page = pages_by_number[page_number]
        source_image = baseline_dir / baseline_page["renderedImage"]
        if not source_image.is_file():
            raise FileNotFoundError(f"Redacted source image was not found: {source_image}")
        image_name = f"slide-{page_number:03d}.redacted.jpg"
        overlay_name = f"slide-{page_number:03d}.semantic.overlay.jpg"
        shutil.copyfile(source_image, output_dir / image_name)
        draw_overlay(output_dir / image_name, output_dir / overlay_name, artifact["regions"])
        artifact["renderedImage"] = image_name
        artifact["overlayImage"] = overlay_name

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if anchors is not None:
        mappings = map_deck_anchors(manifest, anchors)
        mapping_document = {
            "schemaVersion": "pin-region-mapping.v1",
            "pipelineVersion": PIPELINE_VERSION,
            "sourceSha256": manifest.get("sourceSha256"),
            "mappings": mappings,
        }
        (output_dir / "pin-region-mapping.json").write_text(
            json.dumps(mapping_document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate strict multimodal region proposals and build deterministic v2 artifacts."
    )
    parser.add_argument("baseline_manifest", type=Path)
    parser.add_argument("proposals", type=Path, help="Directory containing slide-NNN.json files.")
    parser.add_argument("--page", type=int, action="append", dest="pages")
    parser.add_argument("--anchors", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    baseline_path = args.baseline_manifest.resolve()
    baseline = load_json(baseline_path)
    page_numbers = args.pages or [page["pageNumber"] for page in baseline.get("pages") or []]
    proposals = {
        page_number: load_json(args.proposals.resolve() / f"slide-{page_number:03d}.json")
        for page_number in page_numbers
    }
    anchors: list[dict[str, Any]] | None = None
    if args.anchors is not None:
        anchor_document = load_json(args.anchors.resolve())
        anchors = anchor_document.get("anchors") or anchor_document.get("questions")
        if not isinstance(anchors, list):
            raise ValueError("Anchor file must contain an anchors or questions array.")
        selected = set(page_numbers)
        anchors = [anchor for anchor in anchors if anchor.get("slideNumber") in selected]

    manifest = build_manifest(baseline, proposals, page_numbers)
    output_dir = args.output.resolve()
    require_empty_output(output_dir)
    write_outputs(manifest, baseline, baseline_path.parent, output_dir, anchors)
    print(
        json.dumps(
            {
                "output": str(output_dir),
                "analyzedPageCount": manifest["analyzedPageCount"],
                "regionCount": manifest["regionCount"],
                "mappingCount": len(anchors or []),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
