from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import statistics
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import pdfplumber
from PIL import Image, ImageDraw

try:
    from experiments.semantic_regions.ocr_redaction import (
        RULE_VERSION,
        engine_fingerprint,
        redact_page_image,
        redact_regions,
        redaction_state,
        rule_fingerprint,
        tesseract_version,
    )
except ModuleNotFoundError:
    from ocr_redaction import (  # type: ignore[no-redef]
        RULE_VERSION,
        engine_fingerprint,
        redact_page_image,
        redact_regions,
        redaction_state,
        rule_fingerprint,
        tesseract_version,
    )


PIPELINE_VERSION = "native-layout-baseline.v4"
SCHEMA_VERSION = "slide-artifact.v1"
REGION_TYPES = {
    "title",
    "paragraph",
    "table",
    "chart",
    "formula",
    "code",
    "image",
    "diagram",
    "callout",
    "footer",
    "other",
}
REGION_COLORS = {
    "title": "#2867E8",
    "paragraph": "#0E9F6E",
    "image": "#8B5CF6",
    "callout": "#D97706",
    "footer": "#64748B",
    "other": "#E5484D",
}

BBox = tuple[float, float, float, float]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def bbox_area(bbox: BBox) -> float:
    x0, top, x1, bottom = bbox
    return max(0.0, x1 - x0) * max(0.0, bottom - top)


def bbox_center(bbox: BBox) -> tuple[float, float]:
    x0, top, x1, bottom = bbox
    return ((x0 + x1) / 2, (top + bottom) / 2)


def contains_point(bbox: BBox, point: tuple[float, float]) -> bool:
    x0, top, x1, bottom = bbox
    x, y = point
    return x0 <= x <= x1 and top <= y <= bottom


def normalize_bbox(bbox: BBox, page_width: float, page_height: float) -> dict[str, float]:
    if page_width <= 0 or page_height <= 0:
        raise ValueError("Page dimensions must be positive.")
    x0, top, x1, bottom = bbox
    if x0 > x1 or top > bottom:
        raise ValueError("Invalid bbox ordering.")
    return {
        "x1": round(clamp(x0 / page_width, 0.0, 1.0), 6),
        "y1": round(clamp(top / page_height, 0.0, 1.0), 6),
        "x2": round(clamp(x1 / page_width, 0.0, 1.0), 6),
        "y2": round(clamp(bottom / page_height, 0.0, 1.0), 6),
    }


def choose_smallest_container(subject_bbox: BBox, candidates: Iterable[BBox]) -> BBox | None:
    center = bbox_center(subject_bbox)
    containers = [bbox for bbox in candidates if contains_point(bbox, center)]
    return min(containers, key=lambda bbox: (bbox_area(bbox), bbox[1], bbox[0]), default=None)


def is_usable_visual_bbox(bbox: BBox, page_width: float, page_height: float) -> bool:
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    area_ratio = bbox_area(bbox) / (page_width * page_height)
    if width < page_width * 0.025 or height < page_height * 0.025:
        return False
    return 0.005 <= area_ratio <= 0.65


def classify_text_region(
    text: str,
    bbox: BBox,
    max_font_size: float,
    body_font_size: float,
    page_height: float,
    font_names: Iterable[str] = (),
) -> str:
    normalized_fonts = " ".join(font_names).lower()
    stripped = text.strip()
    top_ratio = bbox[1] / page_height
    bottom_ratio = bbox[3] / page_height

    if bottom_ratio >= 0.91:
        return "footer"
    if any(name in normalized_fonts for name in ("mono", "courier", "consolas")):
        return "code"
    if stripped.startswith(("def ", "class ", "import ", "from ")):
        return "code"
    if top_ratio <= 0.42 and max_font_size >= max(18.0, body_font_size * 1.45):
        return "title"
    return "paragraph"


def importance_for(region_type: str, bbox_norm: dict[str, float]) -> str:
    if region_type == "title":
        return "high"
    if region_type == "footer":
        return "low"
    area = max(0.0, bbox_norm["x2"] - bbox_norm["x1"]) * max(
        0.0, bbox_norm["y2"] - bbox_norm["y1"]
    )
    return "high" if area >= 0.20 else "medium"


def word_from_pdf(raw: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "index": index,
        "text": str(raw.get("text") or "").strip(),
        "bbox": (float(raw["x0"]), float(raw["top"]), float(raw["x1"]), float(raw["bottom"])),
        "font_size": float(raw.get("size") or 0.0),
        "font_name": str(raw.get("fontname") or ""),
    }


def group_words_into_lines(words: Iterable[dict[str, Any]], y_tolerance: float = 3.0) -> list[dict[str, Any]]:
    groups: list[list[dict[str, Any]]] = []
    group_tops: list[float] = []
    for word in sorted(words, key=lambda item: (item["bbox"][1], item["bbox"][0], item["index"])):
        top = word["bbox"][1]
        target_index = next(
            (index for index in range(len(groups) - 1, -1, -1) if abs(group_tops[index] - top) <= y_tolerance),
            None,
        )
        if target_index is None:
            groups.append([word])
            group_tops.append(top)
        else:
            groups[target_index].append(word)
            group_tops[target_index] = statistics.mean(item["bbox"][1] for item in groups[target_index])

    lines: list[dict[str, Any]] = []
    for members in groups:
        members.sort(key=lambda item: (item["bbox"][0], item["index"]))
        lines.append(
            {
                "index": min(item["index"] for item in members),
                "text": " ".join(item["text"] for item in members),
                "bbox": (
                    min(item["bbox"][0] for item in members),
                    min(item["bbox"][1] for item in members),
                    max(item["bbox"][2] for item in members),
                    max(item["bbox"][3] for item in members),
                ),
                "max_font_size": max(item["font_size"] for item in members),
                "font_names": sorted({item["font_name"] for item in members if item["font_name"]}),
            }
        )
    return sorted(lines, key=lambda line: (line["bbox"][1], line["bbox"][0], line["index"]))


def usable_rectangles(page: pdfplumber.page.Page) -> list[BBox]:
    page_area = float(page.width) * float(page.height)
    rectangles: list[BBox] = []
    for rect in page.rects:
        bbox = (float(rect["x0"]), float(rect["top"]), float(rect["x1"]), float(rect["bottom"]))
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        area = bbox_area(bbox)
        if width < page.width * 0.06 or height < page.height * 0.035:
            continue
        if area > page_area * 0.65:
            continue
        rectangles.append(bbox)
    return rectangles


def usable_images(page: pdfplumber.page.Page) -> list[BBox]:
    images: list[BBox] = []
    seen: set[tuple[float, float, float, float]] = set()
    for image in page.images:
        bbox = (float(image["x0"]), float(image["top"]), float(image["x1"]), float(image["bottom"]))
        if not is_usable_visual_bbox(bbox, float(page.width), float(page.height)):
            continue
        key = tuple(round(value, 3) for value in bbox)
        if key in seen:
            continue
        seen.add(key)
        images.append(bbox)
    return images


def native_regions(page: pdfplumber.page.Page) -> list[dict[str, Any]]:
    words = [
        word_from_pdf(raw, index)
        for index, raw in enumerate(page.extract_words(extra_attrs=["fontname", "size"]))
        if str(raw.get("text") or "").strip()
    ]
    body_sizes = [word["font_size"] for word in words if word["font_size"] > 0]
    body_font_size = statistics.median(body_sizes) if body_sizes else 12.0
    rectangles = usable_rectangles(page)
    images = usable_images(page)
    containers = rectangles + images

    grouped_words: dict[BBox, list[dict[str, Any]]] = defaultdict(list)
    ungrouped_words: list[dict[str, Any]] = []
    for word in words:
        container = choose_smallest_container(word["bbox"], containers)
        if container is None:
            ungrouped_words.append(word)
        else:
            grouped_words[container].append(word)

    candidates: list[dict[str, Any]] = []
    for rect_bbox, members in grouped_words.items():
        lines = group_words_into_lines(members)
        text = "\n".join(line["text"] for line in lines)
        fonts = sorted({font for line in lines for font in line["font_names"]})
        max_size = max((line["max_font_size"] for line in lines), default=0.0)
        base_type = classify_text_region(text, rect_bbox, max_size, body_font_size, page.height, fonts)
        region_type = base_type if base_type in {"title", "footer", "code"} else "callout"
        container_source = "pdf-native-image+text" if rect_bbox in images else "pdf-native-shape"
        candidates.append(
            {
                "type": region_type,
                "bbox": rect_bbox,
                "text": text,
                "confidence": 0.72,
                "source": container_source,
            }
        )

    for line in group_words_into_lines(ungrouped_words):
        region_type = classify_text_region(
            line["text"],
            line["bbox"],
            line["max_font_size"],
            body_font_size,
            page.height,
            line["font_names"],
        )
        candidates.append(
            {
                "type": region_type,
                "bbox": line["bbox"],
                "text": line["text"],
                "confidence": 0.82,
                "source": "pdf-native-text",
            }
        )

    used_containers = set(grouped_words)
    for bbox in images:
        if bbox in used_containers:
            continue
        candidates.append(
            {
                "type": "image",
                "bbox": bbox,
                "text": "",
                "confidence": 0.75,
                "source": "pdf-native-image",
            }
        )

    candidates.sort(
        key=lambda region: (
            round(region["bbox"][1], 3),
            round(region["bbox"][0], 3),
            round(bbox_area(region["bbox"]), 3),
            region["type"],
            region["text"],
        )
    )

    regions: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates, start=1):
        bbox_norm = normalize_bbox(candidate["bbox"], float(page.width), float(page.height))
        text = candidate["text"]
        regions.append(
            {
                "alias": f"R{index:03d}",
                "type": candidate["type"],
                "bboxNorm": bbox_norm,
                "polygonNorm": None,
                "readingOrder": index,
                "text": text,
                "summary": text[:240],
                "concepts": [],
                "importance": importance_for(candidate["type"], bbox_norm),
                "confidence": candidate["confidence"],
                "source": candidate["source"],
            }
        )
    validate_regions(regions)
    return regions


def validate_regions(regions: list[dict[str, Any]]) -> None:
    aliases = [region["alias"] for region in regions]
    if len(aliases) != len(set(aliases)):
        raise ValueError("Region aliases must be unique.")
    for region in regions:
        if region["type"] not in REGION_TYPES:
            raise ValueError(f"Unsupported region type: {region['type']}")
        bbox = region["bboxNorm"]
        values = (bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"])
        if not all(0.0 <= value <= 1.0 for value in values):
            raise ValueError(f"Out-of-range region: {region['alias']}")
        if bbox["x1"] > bbox["x2"] or bbox["y1"] > bbox["y2"]:
            raise ValueError(f"Invalid region bounds: {region['alias']}")


def resolve_pdftoppm(explicit_path: str | None) -> str:
    if explicit_path:
        executable = Path(explicit_path)
        if executable.is_file():
            return str(executable)
        raise FileNotFoundError(f"pdftoppm not found: {explicit_path}")
    discovered = shutil.which("pdftoppm")
    if discovered:
        return discovered
    raise FileNotFoundError("pdftoppm was not found. Pass it with --pdftoppm.")


def resolve_tesseract(explicit_path: str) -> str:
    executable = Path(explicit_path)
    if executable.is_file():
        return str(executable)
    discovered = shutil.which(explicit_path)
    if discovered:
        return discovered
    raise FileNotFoundError(f"Tesseract was not found: {explicit_path}")


def render_page(
    executable: str,
    pdf_path: Path,
    page_number: int,
    output_prefix: Path,
    dpi: int,
) -> Path:
    subprocess.run(
        [
            executable,
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-singlefile",
            "-jpeg",
            "-r",
            str(dpi),
            str(pdf_path),
            str(output_prefix),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    output = output_prefix.with_suffix(".jpg")
    if not output.is_file():
        raise RuntimeError(f"Rendered page was not created: {output}")
    return output


def draw_overlay(source: Path, target: Path, regions: list[dict[str, Any]]) -> None:
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    draw = ImageDraw.Draw(image)
    for region in regions:
        bbox = region["bboxNorm"]
        pixel_bbox = (
            round(bbox["x1"] * image.width),
            round(bbox["y1"] * image.height),
            round(bbox["x2"] * image.width),
            round(bbox["y2"] * image.height),
        )
        color = REGION_COLORS.get(region["type"], REGION_COLORS["other"])
        draw.rectangle(pixel_bbox, outline=color, width=3)
        label = f"{region['alias']} {region['type']}"
        label_box = draw.textbbox((0, 0), label)
        label_width = label_box[2] - label_box[0] + 8
        label_height = label_box[3] - label_box[1] + 6
        label_x = max(0, min(pixel_bbox[0], image.width - label_width))
        label_y = max(0, pixel_bbox[1] - label_height)
        draw.rectangle((label_x, label_y, label_x + label_width, label_y + label_height), fill=color)
        draw.text((label_x + 4, label_y + 3), label, fill="white")
    image.save(target, quality=92)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_empty_output(output_dir: Path) -> None:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Output directory must be empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)


def extract_pdf(
    pdf_path: Path,
    output_dir: Path,
    pdftoppm: str,
    start_page: int,
    max_pages: int,
    dpi: int,
    tesseract: str | None = None,
    tessdata_dir: Path | None = None,
    languages: str = "kor+eng",
) -> dict[str, Any]:
    require_empty_output(output_dir)
    source_sha256 = sha256_file(pdf_path)
    pages_json: list[dict[str, Any]] = []
    image_redaction_counts: Counter[str] = Counter()
    native_text_redaction_counts: Counter[str] = Counter()
    successful_redaction_pages = 0
    redaction_enabled = tesseract is not None

    if redaction_enabled and not languages.strip():
        raise ValueError("At least one OCR language is required.")
    if tessdata_dir is not None and not tessdata_dir.is_dir():
        raise FileNotFoundError(f"Tessdata directory was not found: {tessdata_dir}")

    with pdfplumber.open(pdf_path) as document, tempfile.TemporaryDirectory(
        prefix="classpin-semantic-regions-"
    ) as raw_render_dir:
        total_pages = len(document.pages)
        if start_page < 1 or start_page > total_pages:
            raise ValueError(f"start-page must be between 1 and {total_pages}.")
        stop_page = min(total_pages, start_page + max_pages - 1)
        for page_number in range(start_page, stop_page + 1):
            page = document.pages[page_number - 1]
            regions = native_regions(page)
            stem = f"page-{page_number:03d}"
            if redaction_enabled:
                native_text_redaction_counts.update(redact_regions(regions))
                raw_rendered = render_page(
                    pdftoppm,
                    pdf_path,
                    page_number,
                    Path(raw_render_dir) / stem,
                    dpi,
                )
                rendered = output_dir / f"{stem}.redacted.jpg"
                image_redactions = redact_page_image(
                    raw_rendered,
                    rendered,
                    tesseract,
                    languages,
                    tessdata_dir,
                )
                image_redaction_counts.update(item["type"] for item in image_redactions)
                public_redactions = [
                    {
                        "type": item["type"],
                        "bboxNorm": item["bboxNorm"],
                        "source": item["source"],
                    }
                    for item in image_redactions
                ]
                successful_redaction_pages += 1
            else:
                rendered = render_page(pdftoppm, pdf_path, page_number, output_dir / stem, dpi)
                public_redactions = []
            overlay = output_dir / f"{stem}.overlay.jpg"
            draw_overlay(rendered, overlay, regions)
            pages_json.append(
                {
                    "pageNumber": page_number,
                    "widthPt": round(float(page.width), 3),
                    "heightPt": round(float(page.height), 3),
                    "renderedImage": rendered.name,
                    "overlayImage": overlay.name,
                    "redactions": public_redactions,
                    "regions": regions,
                }
            )

    state = redaction_state(redaction_enabled, len(pages_json), successful_redaction_pages)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "sourceFile": pdf_path.name,
        "sourceSha256": source_sha256,
        **state,
        "pageCountInSource": total_pages,
        "analyzedPageCount": len(pages_json),
        "pages": pages_json,
    }
    if redaction_enabled:
        manifest["redaction"] = {
            "ocrEngine": tesseract_version(tesseract),
            "engineFingerprint": engine_fingerprint(tesseract, languages, tessdata_dir),
            "languages": languages.split("+"),
            "ruleVersion": RULE_VERSION,
            "ruleFingerprint": rule_fingerprint(),
            "imageCountByType": dict(sorted(image_redaction_counts.items())),
            "nativeTextCountByType": dict(sorted(native_text_redaction_counts.items())),
        }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract deterministic semantic-region baseline from a PDF.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pdftoppm")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=30)
    parser.add_argument("--dpi", type=int, default=120)
    parser.add_argument(
        "--tesseract",
        help="Enable strict OCR redaction with this Tesseract executable.",
    )
    parser.add_argument("--tessdata-dir", type=Path)
    parser.add_argument("--languages", default="kor+eng")
    args = parser.parse_args()
    if args.max_pages < 1 or args.max_pages > 30:
        parser.error("--max-pages must be between 1 and 30")
    if args.dpi < 72 or args.dpi > 240:
        parser.error("--dpi must be between 72 and 240")
    if args.tessdata_dir is not None and args.tesseract is None:
        parser.error("--tessdata-dir requires --tesseract")
    return args


def main() -> None:
    args = parse_args()
    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    executable = resolve_pdftoppm(args.pdftoppm)
    tesseract = resolve_tesseract(args.tesseract) if args.tesseract else None
    manifest = extract_pdf(
        pdf_path,
        args.output.resolve(),
        executable,
        args.start_page,
        args.max_pages,
        args.dpi,
        tesseract,
        args.tessdata_dir.resolve() if args.tessdata_dir is not None else None,
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
