"""Modal app for the leaf classifier (T10). READY TO TRAIN, NOT YET RUN (user's instruction, 2026-10-04).

Run from ml/ (needs `modal token new` once):
  modal run modal_app.py --stage fetch                 # downloads + extracts all datasets into the Volume (CPU)
  modal run modal_app.py --stage manifest              # labels, pHash de-duplication, splits (CPU)
  modal run modal_app.py --stage train --epochs 12     # GPU training + calibration + ONNX export
  modal run modal_app.py --stage all                   # all three
  --labels p1 adds maize + bean classes (T13). --smoke runs a 30-step training to test the GPU path cheaply.

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
    .add_local_python_source("leaf")
)
data_volume = modal.Volume.from_name("pandastic-data", create_if_missing=True)
models_volume = modal.Volume.from_name("pandastic-models", create_if_missing=True)
DATA, MODELS = Path("/data"), Path("/models")


def _labels(name: str):
    from leaf import config
    return config.P1_LABELS if name == "p1" else config.P0_LABELS


@app.function(image=image, volumes={"/data": data_volume}, cpu=4, memory=8192, timeout=3 * 3600)
def fetch(sources: list[str]) -> None:
    from leaf import data
    data.download(sources, DATA / "raw")
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


@app.function(image=image, volumes={"/data": data_volume, "/models": models_volume}, gpu="L4", cpu=8,
              memory=32768, timeout=4 * 3600)
def train(labels: str, epochs: int, batch_size: int, lr: float, smoke: bool) -> dict:
    from datetime import datetime, timezone
    from leaf import data, train as trainer
    data_volume.reload()
    rows = data.read_manifest(DATA / f"manifest-{labels}.csv")
    stats = json.loads((DATA / f"manifest-{labels}.json").read_text())
    version = f"leaf-{labels}-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M") + ("-smoke" if smoke else "")
    meta = trainer.run(rows, _labels(labels), MODELS / "leaf" / version, stats, epochs=1 if smoke else epochs,
                       batch_size=batch_size, lr=lr, device="cuda", workers=8, max_steps=30 if smoke else None,
                       version=version)
    models_volume.commit()
    return meta


@app.local_entrypoint()
def main(stage: str = "all", labels: str = "p0", epochs: int = 12, batch_size: int = 64, lr: float = 1e-3,
         smoke: bool = False):
    from leaf import config
    sources = ["bracol", "jmuben", "jmuben2", "plantdoc", "ibean"]
    if stage in ("fetch", "all"):
        fetch.remote(sources)
        print("fetched + extracted:", ", ".join(f"{s} ({config.SOURCES[s]['licence']})" for s in sources))
    if stage in ("manifest", "all"):
        print(json.dumps(manifest.remote(labels), indent=2))
    if stage in ("train", "all"):
        meta = train.remote(labels, epochs, batch_size, lr, smoke)
        print(json.dumps(meta["eval"], indent=2))
        print(f"\nmodal volume get pandastic-models leaf/{meta['version']} ./artifacts/\n"
              f"python -m leaf.install artifacts/{meta['version']}")
