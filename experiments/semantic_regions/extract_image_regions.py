from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from PIL import Image

try:
    from experiments.semantic_regions.extract_regions import (
        draw_overlay,
        importance_for,
        normalize_bbox,
        require_empty_output,
        resolve_tesseract,
        validate_regions,
    )
    from experiments.semantic_regions.ocr_redaction import (
        RULE_VERSION,
        build_image_redactions,
        detect_grayscale_sensitive_image_redactions,
        engine_fingerprint,
        mask_image,
        merge_image_redactions,
        parse_tesseract_tsv,
        redact_text,
        redaction_state,
        rule_fingerprint,
        run_tesseract_tsv,
        tesseract_version,
    )
except ModuleNotFoundError:
    from extract_regions import (  # type: ignore[no-redef]
        draw_overlay,
        importance_for,
        normalize_bbox,
        require_empty_output,
        resolve_tesseract,
        validate_regions,
    )
    from ocr_redaction import (  # type: ignore[no-redef]
        RULE_VERSION,
        build_image_redactions,
        detect_grayscale_sensitive_image_redactions,
        engine_fingerprint,
        mask_image,
        merge_image_redactions,
        parse_tesseract_tsv,
        redact_text,
        redaction_state,
        rule_fingerprint,
        run_tesseract_tsv,
        tesseract_version,
    )


PIPELINE_VERSION = "ocr-image-layout-baseline.v1"
SCHEMA_VERSION = "slide-artifact.v1"
SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

BBox = tuple[int, int, int, int]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deck_sha256(images: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for image in images:
        digest.update(image.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256_file(image)))
    return digest.hexdigest()


def discover_images(source_dir: Path) -> list[Path]:
    images = sorted(
        path
        for path in source_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )
    if not images:
        raise FileNotFoundError(f"No supported slide images found: {source_dir}")
    if len(images) > 30:
        raise ValueError("Image deck may contain at most 30 slides.")
    return images


def bbox_union(boxes: Iterable[BBox]) -> BBox:
    items = list(boxes)
    if not items:
        raise ValueError("At least one bbox is required.")
    return (
        min(box[0] for box in items),
        min(box[1] for box in items),
        max(box[2] for box in items),
        max(box[3] for box in items),
    )


def horizontal_overlap_ratio(left: BBox, right: BBox) -> float:
    overlap = max(0, min(left[2], right[2]) - max(left[0], right[0]))
    narrower = min(max(1, left[2] - left[0]), max(1, right[2] - right[0]))
    return overlap / narrower


def vertical_overlap_ratio(top: BBox, bottom: BBox) -> float:
    overlap = max(0, min(top[3], bottom[3]) - max(top[1], bottom[1]))
    shorter = min(max(1, top[3] - top[1]), max(1, bottom[3] - bottom[1]))
    return overlap / shorter


def words_to_lines(words: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[int, int, int, int], list[dict[str, Any]]] = defaultdict(list)
    for word in words:
        groups[word["lineKey"]].append(word)

    lines: list[dict[str, Any]] = []
    for line_key, members in groups.items():
        ordered = sorted(members, key=lambda word: (word["bboxPx"][0], word["index"]))
        lines.append(
            {
                "lineKey": line_key,
                "text": " ".join(word["text"] for word in ordered),
                "bboxPx": bbox_union(word["bboxPx"] for word in ordered),
                "confidence": round(
                    statistics.mean(max(0.0, float(word["confidence"])) for word in ordered) / 100,
                    4,
                ),
                "medianWordHeight": statistics.median(
                    word["bboxPx"][3] - word["bboxPx"][1] for word in ordered
                ),
            }
        )
    return sorted(lines, key=lambda line: (line["bboxPx"][1], line["bboxPx"][0], line["lineKey"]))


def merge_adjacent_lines(
    lines: list[dict[str, Any]], image_width: int
) -> list[list[dict[str, Any]]]:
    if not lines:
        return []
    median_height = statistics.median(line["medianWordHeight"] for line in lines)
    parent = list(range(len(lines)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left_index: int, right_index: int) -> None:
        left_root = find(left_index)
        right_root = find(right_index)
        if left_root != right_root:
            parent[right_root] = left_root

    for left_index, left in enumerate(lines):
        left_bbox = left["bboxPx"]
        for right_index in range(left_index + 1, len(lines)):
            right = lines[right_index]
            right_bbox = right["bboxPx"]
            if right_bbox[1] - left_bbox[3] > median_height * 3.0:
                break
            vertical_gap = max(0, right_bbox[1] - left_bbox[3])
            horizontal_gap = max(
                0,
                max(left_bbox[0], right_bbox[0]) - min(left_bbox[2], right_bbox[2]),
            )
            left_aligned = abs(left_bbox[0] - right_bbox[0]) <= image_width * 0.04
            stacked = vertical_gap <= median_height * 1.9 and (
                horizontal_overlap_ratio(left_bbox, right_bbox) >= 0.20 or left_aligned
            )
            inline = horizontal_gap <= median_height * 1.7 and vertical_overlap_ratio(
                left_bbox, right_bbox
            ) >= 0.45
            height_ratio = max(left["medianWordHeight"], right["medianWordHeight"]) / max(
                1, min(left["medianWordHeight"], right["medianWordHeight"])
            )
            if (stacked or inline) and height_ratio <= 1.8:
                union(left_index, right_index)

    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for index, line in enumerate(lines):
        grouped[find(index)].append(line)
    groups = [
        sorted(members, key=lambda line: (line["bboxPx"][1], line["bboxPx"][0], line["lineKey"]))
        for members in grouped.values()
    ]
    return sorted(
        groups,
        key=lambda members: (
            min(line["bboxPx"][1] for line in members),
            min(line["bboxPx"][0] for line in members),
        ),
    )


def crop_entropy(image: Image.Image, bbox: BBox) -> float:
    x1, y1, x2, y2 = bbox
    padding = 10
    crop = image.crop(
        (
            max(0, x1 - padding),
            max(0, y1 - padding),
            min(image.width, x2 + padding),
            min(image.height, y2 + padding),
        )
    ).convert("L")
    crop.thumbnail((96, 96))
    histogram = crop.histogram()
    total = sum(histogram)
    if total == 0:
        return 0.0
    return -sum(
        probability * math.log2(probability)
        for count in histogram
        if count > 0
        for probability in (count / total,)
    )


def classify_ocr_region(
    text: str,
    bbox: BBox,
    median_word_height: float,
    group_word_height: float,
    image_height: int,
    line_count: int = 1,
    area_ratio: float = 0.0,
    entropy: float = 0.0,
    alignment_spread: float = 0.0,
) -> str:
    top_ratio = bbox[1] / image_height
    bottom_ratio = bbox[3] / image_height
    normalized = text.strip().lower()
    code_signals = (
        "const ",
        "def ",
        "from ",
        "import ",
        "function ",
        "return ",
        "=>",
        "npm ",
        "pip ",
    )
    if bottom_ratio >= 0.93:
        return "footer"
    if any(signal in normalized for signal in code_signals):
        return "code"
    if top_ratio <= 0.32 and group_word_height >= median_word_height * 1.35:
        return "title"
    if len(normalized) <= 28 and top_ratio <= 0.18:
        return "title"
    digit_ratio = sum(character.isdigit() for character in normalized) / max(1, len(normalized))
    if line_count >= 4 and area_ratio >= 0.035 and digit_ratio >= 0.14:
        return "chart"
    if line_count >= 5 and area_ratio >= 0.055 and (entropy >= 4.2 or alignment_spread >= 0.09):
        return "image"
    return "paragraph"


def build_ocr_regions(
    words: list[dict[str, Any]], image_width: int, image_height: int, image: Image.Image | None = None
) -> list[dict[str, Any]]:
    lines = words_to_lines(words)
    if not lines:
        return []
    median_word_height = statistics.median(line["medianWordHeight"] for line in lines)
    groups = merge_adjacent_lines(lines, image_width)
    candidates: list[dict[str, Any]] = []
    for members in groups:
        bbox = bbox_union(line["bboxPx"] for line in members)
        text = "\n".join(line["text"] for line in members)
        redacted_text, _ = redact_text(text)
        group_word_height = max(line["medianWordHeight"] for line in members)
        area_ratio = ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / (image_width * image_height)
        left_edges = [line["bboxPx"][0] / image_width for line in members]
        alignment_spread = statistics.pstdev(left_edges) if len(left_edges) > 1 else 0.0
        entropy = crop_entropy(image, bbox) if image is not None else 0.0
        region_type = classify_ocr_region(
            redacted_text,
            bbox,
            median_word_height,
            group_word_height,
            image_height,
            len(members),
            area_ratio,
            entropy,
            alignment_spread,
        )
        candidates.append(
            {
                "type": region_type,
                "bbox": bbox,
                "textRedacted": redacted_text,
                "confidence": round(statistics.mean(line["confidence"] for line in members), 4),
            }
        )

    candidates.sort(key=lambda item: (item["bbox"][1], item["bbox"][0], item["type"]))
    regions: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates, start=1):
        bbox_norm = normalize_bbox(candidate["bbox"], image_width, image_height)
        redacted_text = candidate["textRedacted"]
        regions.append(
            {
                "alias": f"R{index:03d}",
                "type": candidate["type"],
                "bboxNorm": bbox_norm,
                "polygonNorm": None,
                "readingOrder": index,
                "text": redacted_text,
                "textRedacted": redacted_text,
                "summary": redacted_text[:240],
                "concepts": [],
                "importance": importance_for(candidate["type"], bbox_norm),
                "confidence": candidate["confidence"],
                "source": "tesseract-layout",
            }
        )
    validate_regions(regions)
    return regions


def public_redactions(redactions: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": item["type"],
            "bboxNorm": item["bboxNorm"],
            "source": item["source"],
        }
        for item in redactions
    ]


def extract_image_deck(
    source_dir: Path,
    output_dir: Path,
    tesseract: str,
    tessdata_dir: Path | None,
    languages: str,
) -> dict[str, Any]:
    images = discover_images(source_dir)
    require_empty_output(output_dir)
    pages: list[dict[str, Any]] = []
    redaction_counts: Counter[str] = Counter()
    successful_pages = 0

    for slide_number, source in enumerate(images, start=1):
        raw_tsv = run_tesseract_tsv(tesseract, source, languages, tessdata_dir)
        words = parse_tesseract_tsv(raw_tsv)
        with Image.open(source) as opened:
            image = opened.convert("RGB")
        width, height = image.size
        primary_redactions = build_image_redactions(words, width, height)
        privacy_redactions = detect_grayscale_sensitive_image_redactions(
            source,
            tesseract,
            languages,
            tessdata_dir,
        )
        redactions = merge_image_redactions(primary_redactions, privacy_redactions)
        redaction_counts.update(item["type"] for item in redactions)
        regions = build_ocr_regions(words, width, height, image)
        stem = f"slide-{slide_number:03d}"
        redacted_image = output_dir / f"{stem}.redacted.jpg"
        mask_image(source, redacted_image, redactions)
        overlay_image = output_dir / f"{stem}.overlay.jpg"
        draw_overlay(redacted_image, overlay_image, regions)
        pages.append(
            {
                "pageNumber": slide_number,
                "sourceFile": source.name,
                "sourceSha256": sha256_file(source),
                "widthPx": width,
                "heightPx": height,
                "renderedImage": redacted_image.name,
                "overlayImage": overlay_image.name,
                "redactions": public_redactions(redactions),
                "regions": regions,
            }
        )
        successful_pages += 1

    state = redaction_state(True, len(images), successful_pages)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "sourceType": "image-deck",
        "sourceSha256": deck_sha256(images),
        **state,
        "analyzedPageCount": len(pages),
        "redaction": {
            "ocrEngine": tesseract_version(tesseract),
            "engineFingerprint": engine_fingerprint(tesseract, languages, tessdata_dir),
            "languages": languages.split("+"),
            "ruleVersion": RULE_VERSION,
            "ruleFingerprint": rule_fingerprint(),
            "imageCountByType": dict(sorted(redaction_counts.items())),
        },
        "pages": pages,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract deterministic OCR regions from an ordered slide-image directory."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tesseract", required=True)
    parser.add_argument("--tessdata-dir", type=Path)
    parser.add_argument("--languages", default="kor+eng")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_dir = args.source.resolve()
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory was not found: {source_dir}")
    tesseract = resolve_tesseract(args.tesseract)
    tessdata_dir = args.tessdata_dir.resolve() if args.tessdata_dir is not None else None
    manifest = extract_image_deck(
        source_dir,
        args.output.resolve(),
        tesseract,
        tessdata_dir,
        args.languages,
    )
    print(
        json.dumps(
            {
                "output": str(args.output.resolve()),
                "sourceSha256": manifest["sourceSha256"],
                "analyzedPageCount": manifest["analyzedPageCount"],
                "safeForExternalAi": manifest["safeForExternalAi"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
