"""Render measured local model output as an offline, escaped comparison viewer."""
import argparse
import base64
import json
from collections import Counter
from pathlib import Path


def main(args):
    layout = json.loads(args.layout.read_text(encoding="utf-8"))
    semantics = json.loads(args.semantics.read_text(encoding="utf-8"))
    baseline = json.loads(args.manifest.read_text(encoding="utf-8"))
    florence = json.loads(args.florence.read_text(encoding="utf-8"))
    if layout.get("status") != "complete" or semantics.get("status") not in {"complete", "failed"}:
        raise ValueError("Only finished experiments (including explicit failure) can be viewed")
    enriched = {p["pageNumber"]: p for p in semantics["pages"]}
    for page, original in zip(layout["pages"], baseline["pages"]):
        if page["pageNumber"] != original["pageNumber"]:
            raise ValueError("Page order mismatch")
        image = args.manifest.parent / original["renderedImage"]
        page["image"] = "data:image/jpeg;base64," + base64.b64encode(image.read_bytes()).decode()
        page["baselineRegions"] = original["regions"]
        if page["pageNumber"] in enriched:
            page["regions"] = enriched[page["pageNumber"]]["regions"]
    data = {"layout": layout, "semantics": semantics, "florence": florence,
            "counts": dict(Counter(r["label"] for p in layout["pages"] for r in p["regions"]))}
    if args.table and args.table.exists():
        data["table"] = json.loads(args.table.read_text(encoding="utf-8"))
    if args.meaning_comparison:
        data["meaningComparison"] = json.loads(args.meaning_comparison.read_text(encoding="utf-8"))
    if args.pins:
        data["pinExperiment"] = json.loads(args.pins.read_text(encoding="utf-8"))
    template = Path(__file__).with_name("visual_comparison.html").read_text(encoding="utf-8")
    serialized = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(template.replace("__EXPERIMENT_DATA__", serialized), encoding="utf-8")
    print(args.output.resolve())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("layout", "semantics", "manifest", "florence", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--table", type=Path)
    parser.add_argument("--meaning-comparison", type=Path)
    parser.add_argument("--pins", type=Path)
    main(parser.parse_args())
