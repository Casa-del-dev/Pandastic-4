"""End-to-end smoke test on CPU with synthetic images: manifest -> train -> calibrate -> thresholds -> ONNX -> JSON.

It checks the code path and the output format, not accuracy (no pretrained weights, a few steps).
Optionally also indexes the real local downloads (BRACOL + a JMuBEN zip) to check label mapping and de-duplication.

Usage (from ml/):  python -m leaf.smoke [--real-local ../data/raw]
"""
import argparse
import json
import random
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import config, data, train

COLOURS = {"coffee_healthy": (40, 140, 50), "coffee_rust": (220, 140, 30), "coffee_miner": (200, 190, 120),
           "coffee_cercospora": (120, 80, 40), "coffee_phoma": (30, 30, 30)}


def leaf(path: Path, colour, white_background: bool, rng: random.Random) -> None:
    bg = (250, 250, 250) if white_background else tuple(rng.randint(60, 140) for _ in range(3))
    im = Image.new("RGB", (160, 160), bg)
    d = ImageDraw.Draw(im)
    d.ellipse((20, 40, 140, 120), fill=(50, 150, 60))
    for _ in range(6):
        x, y = rng.randint(40, 110), rng.randint(50, 100)
        d.ellipse((x, y, x + 12, y + 12), fill=colour)
    im.save(path)


def make_synthetic(root: Path, per_class: int = 12) -> None:
    rng = random.Random(0)
    stress = {v: k for k, v in config.BRACOL_STRESS.items()}
    images = root / "bracol/bracol/coffee-datasets/leaf/images"
    images.mkdir(parents=True)
    with open(images.parent / "dataset.csv", "w") as f:
        f.write("id,predominant_stress,miner,rust,phoma,cercospora,severity\n")
        i = 0
        for label, colour in COLOURS.items():
            for _ in range(per_class):
                i += 1
                leaf(images / f"{i}.jpg", colour, True, rng)
                f.write(f"{i},{stress[label]},0,0,0,0,1\n")
        f.write(f"{i + 1},5,1,1,0,0,1\n")  # mixed stress: must be excluded
    folders = {"coffee_cercospora": "Cerscospora", "coffee_rust": "Leaf rust", "coffee_phoma": "Phoma",
               "coffee_healthy": "Healthy", "coffee_miner": "Miner"}
    for label, folder in folders.items():
        d = root / ("jmuben2" if label in ("coffee_healthy", "coffee_miner") else "jmuben") / folder.lower() / folder
        d.mkdir(parents=True)
        for j in range(per_class):
            leaf(d / f"{j}.jpg", COLOURS[label], False, rng)
            if j % 3 == 0:  # a rotated copy, like JMuBEN's augmented duplicates
                Image.open(d / f"{j}.jpg").rotate(90).save(d / f"{j}_rot.jpg")
    for name in ("plantdoc", "ibean"):
        d = root / name / "x" / "Tomato leaf"
        d.mkdir(parents=True)
        for j in range(per_class * 2):
            im = Image.fromarray(np.random.default_rng(j).integers(0, 255, (120, 120, 3), dtype=np.uint8))
            im.save(d / f"{j}.jpg")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--real-local", type=Path, help="data/raw with bracol/ and jmuben/ extracted downloads")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_synthetic(root / "work")
        rows, stats = data.build_manifest(root / "work", config.P0_LABELS, workers=2)
        print("manifest:", json.dumps(stats["counts"]))
        assert all(r["split"] in {"train", "val", "calib", "test"} for r in rows)
        assert not any(r["label"] not in config.P0_LABELS for r in rows)
        assert stats["jmuben_unique"] < stats["jmuben_raw"], "rotated copies were not de-duplicated"
        groups = {}
        for r in rows:  # duplicates never cross splits
            assert groups.setdefault(r["group"], r["split"]) == r["split"], r
        meta = train.run(rows, config.P0_LABELS, root / "out", stats, epochs=1, batch_size=8, pretrained=False,
                         device="cpu", workers=0, max_steps=3, version="leaf-smoke")
        expected = {"version", "arch", "input_size", "resize", "mean", "std", "labels", "temperature",
                    "thresholds", "per_class_min_prob", "eval"}
        assert expected <= set(meta), expected - set(meta)
        assert meta["labels"] == config.P0_LABELS and meta["stub"] is False
        assert (root / "out/leaf_classifier.onnx").stat().st_size > 1_000_000
        assert (root / "out/reports/metrics.json").exists()
        assert set(meta["eval"]["by_crop"]) == {"coffee"}, meta["eval"]["by_crop"]
        again = train.reevaluate(rows, config.P0_LABELS, root / "out", device="cpu", workers=0)
        assert again["eval"]["by_crop"] == meta["eval"]["by_crop"], (again["eval"]["by_crop"], meta["eval"]["by_crop"])
        print("SMOKE OK:", json.dumps(meta["eval"]))

    if args.real_local:
        work = args.real_local
        bracol = data._bracol_rows(work, set(config.P0_LABELS))
        print("real BRACOL rows:", len(bracol), dict(sorted(__import__("collections").Counter(r["label"] for r in bracol).items())))
        paths = [str(p) for p in data._images(work / "jmuben")][:3000]
        groups = data.phash_groups(paths, workers=4)
        print(f"real JMuBEN sample: {len(paths)} images -> {len(set(groups.values()))} unique after de-duplication")


if __name__ == "__main__":
    main()
