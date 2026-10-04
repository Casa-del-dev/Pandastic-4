"""Modal app for the leaf classifier (T10). READY TO TRAIN, NOT YET RUN (user's instruction, 2026-10-04).

Run from ml/ (needs `modal token new` once):
  modal run modal_app.py --stage fetch                 # downloads + extracts all datasets into the Volume (CPU)
  modal run modal_app.py --stage manifest              # labels, pHash de-duplication, splits (CPU)
  modal run modal_app.py --stage cache                 # decode + shrink every image once, drop unreadable (CPU)
  modal run modal_app.py --stage train --epochs 12     # (cache, then) GPU training + calibration + ONNX export
  modal run modal_app.py --stage all                   # all of the above

MLOps: the run id is a hash of (manifest, hyper-parameters, training code), checkpoints are written to the
Volume after every epoch, and the train function retries; so a cancelled or preempted run resumes at its last
epoch when relaunched with the same arguments. Early stopping (patience 4). Lineage hashes go into the metadata.
  modal run --detach modal_app.py --stage all          # same, and it keeps running if this machine sleeps
  --labels p1 adds maize blight/grey leaf spot + bean classes; --labels p2 also healthy maize, fall armyworm and
  streak virus from CCMT (Ghana). --smoke runs a 30-step training to test the GPU path cheaply.
  modal run modal_app.py --stage reeval --labels p1 --version leaf-p1-...   # adds eval.by_crop to an older model

Then fetch the artifacts and install them into the app:
  modal volume get pandastic-models leaf/<version> ./artifacts/
  python -m leaf.install artifacts/<version>
"""
import json
from pathlib import Path

import modal

app = modal.App("pandastic-leaf")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libarchive-tools")  # bsdtar: reads BRACOL's zip, which has no central directory
    .pip_install("torch==2.14.1", "torchvision==0.29.1", "timm==1.0.30", "onnx==1.23.1", "onnxruntime==1.30.0",
                 "pillow==12.3.0", "imagehash==4.3.2", "numpy==2.5.3", "requests")
    .add_local_python_source("leaf", ignore=["**/__pycache__", "**/*.pyc"])  # also ships leaf/ccmt_files.csv
)
data_volume = modal.Volume.from_name("pandastic-data", create_if_missing=True)
models_volume = modal.Volume.from_name("pandastic-models", create_if_missing=True)
DATA, MODELS = Path("/data"), Path("/models")


def _labels(name: str):
    from leaf import config
    return config.LABEL_SETS[name]


@app.function(image=image, volumes={"/data": data_volume}, cpu=4, memory=8192, timeout=3 * 3600)
def fetch(sources: list[str]) -> None:
    from leaf import data
    data.download(sources, DATA / "raw", work_dir=DATA / "work")
    data_volume.commit()
    data.extract(sources, DATA / "raw", DATA / "work")
    data_volume.commit()


@app.function(image=image, volumes={"/data": data_volume}, cpu=16, memory=16384, timeout=2 * 3600)
def manifest(labels: str) -> dict:
    from leaf import data
    rows, stats = data.build_manifest(DATA / "work", _labels(labels), workers=16)
    data.write_manifest(rows, DATA / f"manifest-{labels}.csv")
    (DATA / f"manifest-{labels}.json").write_text(json.dumps(stats, indent=2))
    data_volume.commit()
    return stats


@app.function(image=image, volumes={"/data": data_volume}, cpu=16, memory=16384, timeout=2 * 3600)
def cache(labels: str) -> dict:
    """Decode + shrink every image once (CPU), so GPU epochs read small JPEGs. Reused across runs and labels."""
    from leaf import data
    data_volume.reload()
    rows, dropped = data.build_cache(data.read_manifest(DATA / f"manifest-{labels}.csv"), DATA / "cache", workers=16)
    data.write_manifest(rows, DATA / f"manifest-{labels}-cached.csv")
    data_volume.commit()
    return {"cached": len(rows), "dropped": dropped}


def _run_id(labels: str, manifest_bytes: bytes, hparams: dict) -> tuple[str, dict]:
    """Same data + hyper-parameters + training code -> same run id, so a restarted run resumes its checkpoint."""
    import hashlib
    from pathlib import Path as P
    import leaf.train
    code = P(leaf.train.__file__).read_bytes() + P(leaf.train.__file__).with_name("config.py").read_bytes()
    config_hash = hashlib.sha256(json.dumps(hparams, sort_keys=True).encode() + code).hexdigest()
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    run_id = f"leaf-{labels}-{hashlib.sha256((manifest_sha + config_hash).encode()).hexdigest()[:8]}"
    return run_id, {"manifest_sha256": manifest_sha, "config_sha256": config_hash}


# Retries + per-epoch checkpoints: a preempted or cancelled container resumes where it stopped.
@app.function(image=image, volumes={"/data": data_volume, "/models": models_volume}, gpu="L4", cpu=16,
              memory=32768, timeout=4 * 3600, retries=modal.Retries(max_retries=2, initial_delay=10.0))
def train(labels: str, epochs: int, batch_size: int, lr: float, smoke: bool, git_sha: str = "") -> dict:
    import timm
    import torch
    from leaf import config, data, train as trainer
    data_volume.reload()
    models_volume.reload()
    cached = DATA / f"manifest-{labels}-cached.csv"
    manifest_path = cached if cached.exists() else DATA / f"manifest-{labels}.csv"
    rows = data.read_manifest(manifest_path)
    stats = json.loads((DATA / f"manifest-{labels}.json").read_text())
    hparams = {"labels": labels, "epochs": epochs, "batch_size": batch_size, "lr": lr, "smoke": smoke,
               "arch": config.ARCH, "seed": 13, "patience": 4}
    version, hashes = _run_id(labels, manifest_path.read_bytes(), hparams)
    version += "-smoke" if smoke else ""
    lineage = {**hashes, "manifest": manifest_path.name, "git_sha": git_sha, "seed": 13,
               "torch": str(torch.__version__), "timm": str(timm.__version__)}
    print(f"run {version} (resumes automatically if checkpoints exist), lineage {lineage}")
    meta = trainer.run(rows, _labels(labels), MODELS / "leaf" / version, stats, epochs=1 if smoke else epochs,
                       batch_size=batch_size, lr=lr, device="cuda", workers=14, max_steps=30 if smoke else None,
                       version=version, on_checkpoint=models_volume.commit, lineage=lineage)
    models_volume.commit()
    # Plain JSON types only: the laptop that receives this has no torch/numpy to unpickle their objects.
    return json.loads(json.dumps(meta, default=str))


@app.function(image=image, volumes={"/data": data_volume, "/models": models_volume}, cpu=16, memory=16384,
              timeout=3600)
def reeval(labels: str, version: str) -> dict:
    """Adds the per-crop breakdown to a model trained before it existed (CPU; a few minutes)."""
    from leaf import data, train as trainer
    cached = DATA / f"manifest-{labels}-cached.csv"  # readable, pre-resized images when the cache stage has run
    rows = data.read_manifest(cached if cached.exists() else DATA / f"manifest-{labels}.csv")
    meta = trainer.reevaluate(rows, _labels(labels), MODELS / "leaf" / version, device="cpu", workers=14)
    models_volume.commit()
    return meta


SOURCES = ["bracol", "jmuben", "jmuben2", "plantdoc", "ibean", "ccmt"]


@app.function(image=image, timeout=8 * 3600)
def pipeline(stage: str, labels: str, epochs: int, batch_size: int, lr: float, smoke: bool, git_sha: str = "") -> dict:
    """Runs the stages from Modal, not from the laptop, so a detached run finishes even if the laptop sleeps."""
    result = {}
    if stage in ("fetch", "all"):
        fetch.remote(SOURCES)
    if stage in ("manifest", "all"):
        result["manifest"] = manifest.remote(labels)
    if stage in ("cache", "train", "all"):  # idempotent: only new images are decoded
        result["cache"] = cache.remote(labels)
    if stage in ("train", "all"):
        result["meta"] = train.remote(labels, epochs, batch_size, lr, smoke, git_sha)
    return result


@app.local_entrypoint()
def main(stage: str = "all", labels: str = "p0", epochs: int = 12, batch_size: int = 64, lr: float = 1e-3,
         smoke: bool = False, version: str = ""):
    import subprocess
    from leaf import config
    if stage == "reeval":
        print(json.dumps(reeval.remote(labels, version)["eval"], indent=2))
        return
    git_sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    result = pipeline.remote(stage, labels, epochs, batch_size, lr, smoke, git_sha)
    if "cache" in result:
        print(f"cache: {result['cache']['cached']} images, dropped {len(result['cache']['dropped'])}")
    if stage in ("fetch", "all"):
        print("fetched + extracted:", ", ".join(f"{s} ({config.SOURCES[s]['licence']})" for s in SOURCES))
    if "manifest" in result:
        print(json.dumps(result["manifest"], indent=2))
    if "meta" in result:
        meta = result["meta"]
        print(json.dumps(meta["eval"], indent=2))
        print(f"\nmodal volume get pandastic-models leaf/{meta['version']} ./artifacts/\n"
              f"python -m leaf.install artifacts/{meta['version']}")
