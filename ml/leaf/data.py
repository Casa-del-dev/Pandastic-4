"""Download, extract and index the leaf datasets into one manifest (path, label, source, split, group).

Splits:
  train / val  BRACOL (Brazil) coffee + 70% / 10% of `other`. val drives early stopping and temperature scaling.
  calib / test JMuBEN + JMuBEN2 (Kenya, another country) de-duplicated, split 50/50 by duplicate group,
               + 10% / 10% of `other`. Thresholds are chosen on calib; numbers are reported on test only.
"""
import csv
import hashlib
import os
import random
import shutil
import subprocess
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from . import config

IMAGE_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


# ---------------------------------------------------------------- download + extract

def download(sources, raw_dir: Path, log=print) -> None:
    import requests
    for name in sources:
        for filename, url in config.SOURCES[name]["files"].items():
            target = raw_dir / name / filename
            if target.exists() and target.stat().st_size > 0:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            log(f"download {name}/{filename}")
            tmp = target.with_suffix(target.suffix + ".part")
            with requests.get(url, stream=True, timeout=600, headers={"User-Agent": "pandastic-research"}) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            tmp.replace(target)


def extract(sources, raw_dir: Path, work_dir: Path, log=print) -> None:
    """zipfile first; archives without a central directory (BRACOL) fall back to bsdtar's streaming reader."""
    for name in sources:
        for filename in config.SOURCES[name]["files"]:
            archive = raw_dir / name / filename
            dest = work_dir / name / Path(filename).stem
            if (dest / ".done").exists():
                continue
            if dest.exists():
                shutil.rmtree(dest)
            dest.mkdir(parents=True)
            log(f"extract {name}/{filename}")
            try:
                with zipfile.ZipFile(archive) as z:
                    z.extractall(dest)
            except zipfile.BadZipFile:
                if not shutil.which("bsdtar"):
                    raise RuntimeError(f"{archive} has no zip directory; install libarchive-tools (bsdtar)")
                # bsdtar exits non-zero on the truncated last entry; keep everything it could read.
                subprocess.run(["bsdtar", "-xf", str(archive), "-C", str(dest)], check=False)
            (dest / ".done").write_text("ok")


# ---------------------------------------------------------------- de-duplication

def _canonical_phash(path: str) -> str:
    """Perceptual hash that is the same for all 8 rotations/flips of an image (JMuBEN contains such copies)."""
    import imagehash
    from PIL import Image, ImageOps
    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("L").resize((64, 64))
    except Exception:
        return "unreadable:" + hashlib.md5(path.encode()).hexdigest()
    variants = []
    for flipped in (im, ImageOps.mirror(im)):
        for angle in (0, 90, 180, 270):
            variants.append(str(imagehash.phash(flipped.rotate(angle))))
    return min(variants)


def phash_groups(paths, workers: int = os.cpu_count() or 2) -> dict:
    """path -> group id; images whose canonical pHash is identical share a group."""
    with ProcessPoolExecutor(max_workers=workers) as pool:
        hashes = list(pool.map(_canonical_phash, paths, chunksize=64))
    return dict(zip(paths, hashes))


# ---------------------------------------------------------------- manifest

def _images(root: Path):
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith(IMAGE_EXT) and not f.startswith("._"):
                yield Path(dirpath) / f


def _folder_label(path: Path, mapping):
    for part in reversed([p.lower() for p in path.parts[:-1]]):
        for key, label in mapping:
            if key in part:
                return label
    return None


def _bracol_rows(work_dir: Path, labels):
    csvs = list((work_dir / "bracol").rglob("leaf/dataset.csv"))
    if not csvs:
        return []
    table = csvs[0]
    images = {p.stem: p for p in (table.parent / "images").glob("*.jpg")}
    rows = []
    with open(table, newline="") as f:
        for r in csv.DictReader(f):
            label = config.BRACOL_STRESS.get(r["predominant_stress"])
            if label in labels and r["id"] in images and images[r["id"]].stat().st_size > 0:
                rows.append({"path": str(images[r["id"]]), "label": label, "source": "bracol", "group": f"bracol:{r['id']}"})
    return rows


def _jmuben_rows(work_dir: Path, labels, workers):
    paths = [str(p) for name in ("jmuben", "jmuben2") for p in _images(work_dir / name)]
    groups = phash_groups(paths, workers) if paths else {}
    rows = []
    for p in paths:
        label = _folder_label(Path(p), config.JMUBEN_FOLDERS)
        if label in labels:
            rows.append({"path": p, "label": label, "source": "jmuben", "group": "jmuben:" + groups[p]})
    return rows


def _other_rows(work_dir: Path, labels):
    rows = []
    for name, p1_map in (("plantdoc", config.PLANTDOC_P1), ("ibean", config.IBEAN_P1)):
        for p in _images(work_dir / name):
            label = "other"
            if "other" not in labels:
                continue
            folder = p.parent.name.lower()
            for key, mapped in p1_map.items():
                if key == folder and mapped in labels:
                    label = mapped
            rows.append({"path": str(p), "label": label, "source": name, "group": f"{name}:{p.stem}"})
    return rows


def _split_by_group(rows, fractions, seed):
    """Assign splits per (label, group) so duplicates never cross splits. fractions: [(split, share), ...]."""
    by_label = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_label[r["label"]][r["group"]].append(r)
    rng = random.Random(seed)
    for label, groups in by_label.items():
        keys = sorted(groups)
        rng.shuffle(keys)
        start = 0
        for i, (split, share) in enumerate(fractions):
            end = len(keys) if i == len(fractions) - 1 else start + round(share * len(keys))
            for key in keys[start:end]:
                for r in groups[key]:
                    r["split"] = split
            start = end


def build_manifest(work_dir: Path, labels, seed: int = 13, max_test_per_class: int = 1000,
                   workers: int = os.cpu_count() or 2, log=print):
    labels = set(labels)
    bracol = _bracol_rows(work_dir, labels)
    _split_by_group(bracol, [("train", 0.85), ("val", 0.15)], seed)

    jmuben = _jmuben_rows(work_dir, labels, workers)
    # Keep one image per duplicate group: the test then counts distinct leaves, not augmented copies.
    first = {}
    for r in jmuben:
        first.setdefault(r["group"], r)
    jmuben_unique = list(first.values())
    log(f"jmuben: {len(jmuben)} images -> {len(jmuben_unique)} after rotation/flip-invariant pHash de-duplication")
    rng = random.Random(seed)
    capped = []
    for label in sorted({r["label"] for r in jmuben_unique}):
        items = [r for r in jmuben_unique if r["label"] == label]
        rng.shuffle(items)
        capped += items[: 2 * max_test_per_class]
    _split_by_group(capped, [("calib", 0.5), ("test", 0.5)], seed)

    other = _other_rows(work_dir, labels)
    _split_by_group(other, [("train", 0.7), ("val", 0.1), ("calib", 0.1), ("test", 0.1)], seed)

    rows = bracol + capped + other
    stats = {
        "counts": {f"{s}/{l}": c for (s, l), c in sorted(Counter((r["split"], r["label"]) for r in rows).items())},
        "by_source": {f"{s}/{src}": c for (s, src), c in sorted(Counter((r["split"], r["source"]) for r in rows).items())},
        "jmuben_raw": len(jmuben), "jmuben_unique": len(jmuben_unique),
        "labels_without_training_data": sorted(labels - {r["label"] for r in rows if r["split"] == "train"}),
    }
    return rows, stats


def write_manifest(rows, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "label", "source", "split", "group"])
        w.writeheader()
        w.writerows(rows)


def read_manifest(path: Path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
