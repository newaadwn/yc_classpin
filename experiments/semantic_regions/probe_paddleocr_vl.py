from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from PIL import Image

try:
    from experiments.semantic_regions.probe_florence2 import (
        PeakMemoryMonitor,
        sha256_file,
    )
except ModuleNotFoundError:
    from probe_florence2 import PeakMemoryMonitor, sha256_file  # type: ignore[no-redef]


MODEL_ID = "PaddlePaddle/PaddleOCR-VL-1.6"
MODEL_REVISION = "c5630abae1d940eafe0697512a0325494b02ab42"
MODEL_LICENSE = "Apache-2.0"
TASK_PROMPTS = {
    "ocr": "OCR:",
    "table": "Table Recognition:",
    "spotting": "Spotting:",
    "chart": "Chart Recognition:",
}
DEFAULT_MAX_PIXELS = 1280 * 28 * 28


def run_task(
    *,
    model: Any,
    processor: Any,
    image: Image.Image,
    task_prompt: str,
    max_new_tokens: int,
    max_pixels: int,
    torch: Any,
    max_seconds: float = 180,
) -> dict[str, Any]:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": task_prompt},
            ],
        }
    ]
    processor_size = processor.image_processor.size
    shortest_edge = int(processor_size.get("shortest_edge", 112896))
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
        images_kwargs={
            "size": {
                "shortest_edge": shortest_edge,
                "longest_edge": max_pixels,
            }
        },
    )
    started = time.perf_counter()
    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            max_time=max_seconds,
        )
    latency_ms = round((time.perf_counter() - started) * 1000)
    input_token_count = int(inputs["input_ids"].shape[-1])
    output_ids = outputs[0][input_token_count:]
    complete = bool(len(output_ids) and output_ids[-1].item() == processor.tokenizer.eos_token_id)
    if len(output_ids) and output_ids[-1].item() == processor.tokenizer.eos_token_id:
        output_ids = output_ids[:-1]
    text = processor.decode(output_ids, skip_special_tokens=False)
    return {
        "task": task_prompt,
        "latencyMs": latency_ms,
        "inputTokenCount": input_token_count,
        "generatedTokenCount": int(len(output_ids)),
        "text": text,
        "complete": complete,
        "maxGenerationSeconds": max_seconds,
    }


def probe(
    image_path: Path,
    task_names: list[str],
    *,
    max_new_tokens: int,
    max_pixels: int,
) -> dict[str, Any]:
    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor

    monitor = PeakMemoryMonitor()
    monitor.start()
    total_started = time.perf_counter()
    load_started = time.perf_counter()
    processor = AutoProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
    ).eval()
    model_load_ms = round((time.perf_counter() - load_started) * 1000)

    try:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        results = []
        for name in task_names:
            results.append(
                run_task(
                    model=model,
                    processor=processor,
                    image=image,
                    task_prompt=TASK_PROMPTS[name],
                    max_new_tokens=max_new_tokens,
                    max_pixels=max_pixels,
                    torch=torch,
                )
            )
        return {
            "schemaVersion": "local-model-probe.v1",
            "provider": "local-transformers",
            "model": MODEL_ID,
            "modelRevision": MODEL_REVISION,
            "modelLicense": MODEL_LICENSE,
            "device": "cpu",
            "dtype": "bfloat16",
            "sourceSha256": sha256_file(image_path),
            "image": {"widthPx": image.width, "heightPx": image.height},
            "maxPixels": max_pixels,
            "modelLoadMs": model_load_ms,
            "totalLatencyMs": round((time.perf_counter() - total_started) * 1000),
            "peakRssBytes": monitor.peak_rss_bytes,
            "results": results,
        }
    finally:
        monitor.stop()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run pinned PaddleOCR-VL on one already-redacted slide."
    )
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--task",
        action="append",
        choices=sorted(TASK_PROMPTS),
        dest="tasks",
        help="Task to run. Repeat to select multiple tasks; defaults to spotting.",
    )
    parser.add_argument("--max-new-tokens", type=int, default=768)
    parser.add_argument("--max-pixels", type=int, default=DEFAULT_MAX_PIXELS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    image_path = args.image.resolve()
    output_path = args.output.resolve()
    if not image_path.is_file():
        raise FileNotFoundError(f"Input image was not found: {image_path}")
    if output_path.exists():
        raise FileExistsError(f"Output already exists: {output_path}")
    if not 64 <= args.max_new_tokens <= 4096:
        raise ValueError("max-new-tokens must be between 64 and 4096.")
    if not 224 * 224 <= args.max_pixels <= 2048 * 2048:
        raise ValueError("max-pixels must be between 224^2 and 2048^2.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = probe(
        image_path,
        args.tasks or ["spotting"],
        max_new_tokens=args.max_new_tokens,
        max_pixels=args.max_pixels,
    )
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "model": result["model"],
                "modelRevision": result["modelRevision"],
                "totalLatencyMs": result["totalLatencyMs"],
                "peakRssBytes": result["peakRssBytes"],
                "taskCount": len(result["results"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
