"""Train, calibrate, pick thresholds, export ONNX + leaf_classifier.json + reports (contracts section 1)."""
import csv
import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageFilter, ImageOps
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from . import config


# ---------------------------------------------------------------- data

def load_rgb(path: str) -> Image.Image:
    with Image.open(path) as im:
        return ImageOps.exif_transpose(im).convert("RGB")


def to_tensor(im: Image.Image) -> torch.Tensor:
    """Contract preprocessing: direct bilinear resize to 224 (no crop), /255, ImageNet mean/std, CHW."""
    im = im.resize((config.INPUT_SIZE, config.INPUT_SIZE), Image.BILINEAR)
    x = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255.0).permute(2, 0, 1)
    mean = torch.tensor(config.MEAN).view(3, 1, 1)
    std = torch.tensor(config.STD).view(3, 1, 1)
    return (x - mean) / std


def replace_white_background(im: Image.Image, background: Image.Image) -> Image.Image:
    """BRACOL leaves are shot on white paper; paste them on a field-like background so 'white = coffee' isn't learned."""
    a = np.asarray(im, dtype=np.int16)
    white = (a.min(axis=2) > 185) & ((a.max(axis=2) - a.min(axis=2)) < 30)
    if white.mean() < 0.15:
        return im
    mask = Image.fromarray(((~white) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
    return Image.composite(im, background.resize(im.size), mask)


class LeafDataset(Dataset):
    def __init__(self, rows, labels, train: bool, backgrounds=None, seed: int = 0):
        self.rows = rows
        self.index = {label: i for i, label in enumerate(labels)}
        self.train = train
        self.backgrounds = backgrounds or []
        self.rng = random.Random(seed)

    def __len__(self):
        return len(self.rows)

    def _augment(self, im: Image.Image, source: str) -> Image.Image:
        rng = self.rng
        if source == "bracol" and self.backgrounds and rng.random() < 0.8:
            im = replace_white_background(im, load_rgb(rng.choice(self.backgrounds)))
        w, h = im.size  # random crop of 60-100% area, then flips/rotations/colour, as field photos vary
        scale = rng.uniform(0.6, 1.0)
        cw, ch = int(w * math.sqrt(scale)), int(h * math.sqrt(scale))
        x0, y0 = rng.randint(0, max(0, w - cw)), rng.randint(0, max(0, h - ch))
        im = im.crop((x0, y0, x0 + cw, y0 + ch))
        if rng.random() < 0.5:
            im = ImageOps.mirror(im)
        im = im.rotate(rng.choice([0, 90, 180, 270]) + rng.uniform(-15, 15), expand=False, fillcolor=(90, 110, 70))
        from PIL import ImageEnhance
        for enhancer in (ImageEnhance.Brightness, ImageEnhance.Contrast, ImageEnhance.Color):
            im = enhancer(im).enhance(rng.uniform(0.7, 1.3))
        if rng.random() < 0.2:
            im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 1.5)))
        return im

    def __getitem__(self, i):
        r = self.rows[i]
        im = load_rgb(r["path"])
        if self.train:
            im = self._augment(im, r["source"])
        return to_tensor(im), self.index[r["label"]]


# ---------------------------------------------------------------- model + training

def create_model(num_classes: int, pretrained: bool):
    import timm
    return timm.create_model(config.ARCH, pretrained=pretrained, num_classes=num_classes)


@torch.no_grad()
def predict_logits(model, rows, labels, device, batch_size=128, workers=4):
    model.eval()
    loader = DataLoader(LeafDataset(rows, labels, train=False), batch_size=batch_size, num_workers=workers)
    out, ys = [], []
    for x, y in loader:
        out.append(model(x.to(device)).float().cpu())
        ys.append(y)
    if not out:
        return torch.zeros(0, len(labels)), torch.zeros(0, dtype=torch.long)
    return torch.cat(out), torch.cat(ys)


def train_model(rows, labels, epochs=12, batch_size=64, lr=1e-3, pretrained=True, device="cpu",
                workers=4, max_steps=None, log=print, seed=13):
    torch.manual_seed(seed)
    train_rows = [r for r in rows if r["split"] == "train"]
    val_rows = [r for r in rows if r["split"] == "val"]
    backgrounds = [r["path"] for r in train_rows if r["label"] == "other"][:2000]
    dataset = LeafDataset(train_rows, labels, train=True, backgrounds=backgrounds, seed=seed)
    counts = np.bincount([dataset.index[r["label"]] for r in train_rows], minlength=len(labels))
    weights = [1.0 / max(1, counts[dataset.index[r["label"]]]) for r in train_rows]  # class-balanced sampling
    sampler = WeightedRandomSampler(weights, num_samples=len(train_rows), replacement=True)
    loader = DataLoader(dataset, batch_size=batch_size, sampler=sampler, num_workers=workers, drop_last=len(train_rows) > batch_size)

    model = create_model(len(labels), pretrained).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    steps = epochs * max(1, len(loader))
    if max_steps:
        steps = min(steps, max_steps)
    warmup = max(1, int(0.05 * steps))  # linear warmup, then cosine decay; safe for any number of steps
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lambda s: (s + 1) / warmup if s < warmup
                                                  else 0.5 * (1 + math.cos(math.pi * (s - warmup) / max(1, steps - warmup))))
    use_amp = device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    best_state, best_val, step, history = None, -1.0, 0, []
    for epoch in range(epochs):
        model.train()
        started, total, seen = time.time(), 0.0, 0
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=use_amp):
                loss = F.cross_entropy(model(x), y, label_smoothing=0.1)
            optimizer.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            total += loss.item() * len(y)
            seen += len(y)
            step += 1
            if max_steps and step >= max_steps:
                break
        logits, y_val = predict_logits(model, val_rows, labels, device, workers=workers)
        val_acc = (logits.argmax(1) == y_val).float().mean().item() if len(y_val) else 0.0
        history.append({"epoch": epoch + 1, "train_loss": total / max(1, seen), "val_acc": val_acc, "seconds": time.time() - started})
        log(f"epoch {epoch + 1}/{epochs} loss {total / max(1, seen):.4f} val_acc {val_acc:.4f}")
        if val_acc > best_val:
            best_val, best_state = val_acc, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        if max_steps and step >= max_steps:
            break
    model.load_state_dict(best_state)
    return model, history


# ---------------------------------------------------------------- calibration + thresholds

def fit_temperature(logits: torch.Tensor, y: torch.Tensor) -> float:
    """Temperature scaling (Guo et al. 2017) on the validation split."""
    if len(y) == 0:
        return 1.0
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        optimizer.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), y)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.exp().clamp(0.05, 20).item())


def selective_metrics(probs: np.ndarray, y: np.ndarray, labels, min_prob: float, min_margin: float) -> dict:
    """What the app's resolver would do: answer only if top1 != other and p1 >= min_prob and margin >= min_margin."""
    other = labels.index("other") if "other" in labels else -1
    order = np.argsort(-probs, axis=1)
    top, second = order[:, 0], order[:, 1]
    p1 = probs[np.arange(len(y)), top]
    margin = p1 - probs[np.arange(len(y)), second]
    answered = (top != other) & (p1 >= min_prob) & (margin >= min_margin)
    is_plant = y != other
    plant_answered = answered & is_plant
    correct = plant_answered & (top == y)
    return {
        "coverage": float(plant_answered.sum() / max(1, is_plant.sum())),
        "selective_accuracy": float(correct.sum() / max(1, plant_answered.sum())),
        "other_false_accept": float((answered & ~is_plant).sum() / max(1, (~is_plant).sum())),
        "answered": int(plant_answered.sum()), "n_plant": int(is_plant.sum()), "n_other": int((~is_plant).sum()),
    }


def choose_thresholds(probs, y, labels, target_accuracy=0.90, max_other_false_accept=0.05):
    """Highest coverage that meets the accuracy target on the calib split; otherwise the most accurate setting."""
    best, fallback = None, None
    for min_prob in np.arange(0.40, 0.96, 0.025):
        for min_margin in np.arange(0.0, 0.61, 0.05):
            m = selective_metrics(probs, y, labels, float(min_prob), float(min_margin))
            m.update(min_prob=round(float(min_prob), 3), min_margin=round(float(min_margin), 3))
            ok = m["selective_accuracy"] >= target_accuracy and m["other_false_accept"] <= max_other_false_accept
            if ok and (best is None or m["coverage"] > best["coverage"]):
                best = m
            if m["coverage"] >= 0.10 and (fallback is None or m["selective_accuracy"] > fallback["selective_accuracy"]):
                fallback = m
    chosen = best or fallback or {"min_prob": 0.7, "min_margin": 0.25}
    chosen["met_target"] = best is not None
    return chosen


# ---------------------------------------------------------------- export

def export_onnx(model, path: Path) -> None:
    model = model.cpu().eval()
    dummy = torch.randn(1, 3, config.INPUT_SIZE, config.INPUT_SIZE)
    kwargs = dict(input_names=["input"], output_names=["logits"], opset_version=17, dynamic_axes=None)
    try:
        torch.onnx.export(model, dummy, str(path), dynamo=False, **kwargs)
    except TypeError:  # older torch without the dynamo flag
        torch.onnx.export(model, dummy, str(path), **kwargs)
    import onnx
    onnx.checker.check_model(onnx.load(str(path)))


def onnx_parity(model, path: Path, samples: torch.Tensor) -> float:
    import onnxruntime as ort
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        expected = model.cpu().eval()(samples).numpy()
    got = np.concatenate([session.run(["logits"], {"input": samples[i:i + 1].numpy()})[0] for i in range(len(samples))])
    return float(np.abs(expected - got).max())


# ---------------------------------------------------------------- full run

def run(rows, labels, out_dir: Path, manifest_stats: dict, epochs=12, batch_size=64, lr=1e-3, pretrained=True,
        device=None, workers=4, max_steps=None, target_accuracy=0.90, version=None, log=print) -> dict:
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    out_dir.mkdir(parents=True, exist_ok=True)
    version = version or "leaf-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    log(f"{version}: {sum(r['split'] == 'train' for r in rows)} train rows on {device}, labels {labels}")

    model, history = train_model(rows, labels, epochs, batch_size, lr, pretrained, device, workers, max_steps, log)
    split = lambda name: [r for r in rows if r["split"] == name]
    val_logits, val_y = predict_logits(model, split("val"), labels, device, workers=workers)
    temperature = fit_temperature(val_logits, val_y)
    log(f"temperature {temperature:.3f}")

    def probs_of(name):
        logits, y = predict_logits(model, split(name), labels, device, workers=workers)
        return F.softmax(logits / temperature, dim=1).numpy(), y.numpy()

    calib_p, calib_y = probs_of("calib")
    test_p, test_y = probs_of("test")
    th = choose_thresholds(calib_p, calib_y, labels, target_accuracy) if len(calib_y) else {"min_prob": 0.7, "min_margin": 0.25, "met_target": False}
    test_m = selective_metrics(test_p, test_y, labels, th["min_prob"], th["min_margin"]) if len(test_y) else {}
    test_acc = float((test_p.argmax(1) == test_y).mean()) if len(test_y) else 0.0
    log(f"thresholds {th} -> test {test_m}, top-1 accuracy {test_acc:.4f}")

    onnx_path = out_dir / "leaf_classifier.onnx"
    export_onnx(model, onnx_path)
    sample_rows = (split("test") or split("val") or split("train"))[:8]
    samples = torch.stack([to_tensor(load_rgb(r["path"])) for r in sample_rows])
    parity = onnx_parity(model, onnx_path, samples)
    log(f"onnx parity max |diff| {parity:.2e}")
    if parity > 1e-3:
        raise RuntimeError(f"ONNX output differs from PyTorch by {parity}")

    metadata = {
        "version": version, "stub": False, "arch": config.ARCH, "input_size": config.INPUT_SIZE,
        "resize": "direct_bilinear", "mean": config.MEAN, "std": config.STD, "labels": list(labels),
        "temperature": round(temperature, 4),
        "thresholds": {"min_prob": th["min_prob"], "min_margin": th["min_margin"]},
        "per_class_min_prob": {},
        "eval": {
            "test_set": "JMuBEN + JMuBEN2 (Kenya), rotation/flip-invariant pHash de-duplicated, + held-out `other`",
            "n": int(len(test_y)), "accuracy": round(test_acc, 4),
            "coverage_at_threshold": round(test_m.get("coverage", 0.0), 4),
            "selective_accuracy": round(test_m.get("selective_accuracy", 0.0), 4),
            "other_false_accept": round(test_m.get("other_false_accept", 0.0), 4),
            "thresholds_met_target": bool(th.get("met_target")), "target_selective_accuracy": target_accuracy,
        },
        "training": {"train_set": "BRACOL (Brazil) + PlantDoc/iBean as other", "epochs_run": len(history),
                     "pretrained": pretrained, "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
    }
    (out_dir / "leaf_classifier.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    write_reports(out_dir, labels, test_p, test_y, calib_p, calib_y, history, manifest_stats, metadata, th)
    log(f"wrote {onnx_path} ({onnx_path.stat().st_size // 1024} KB) + leaf_classifier.json + reports/")
    return metadata


def write_reports(out_dir, labels, test_p, test_y, calib_p, calib_y, history, manifest_stats, metadata, th):
    reports = out_dir / "reports"
    reports.mkdir(exist_ok=True)
    n = len(labels)
    confusion = np.zeros((n, n), dtype=int)
    for truth, pred in zip(test_y, test_p.argmax(1) if len(test_y) else []):
        confusion[truth, pred] += 1
    with open(reports / "confusion_test.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["true \\ predicted"] + list(labels))
        for i, label in enumerate(labels):
            w.writerow([label] + confusion[i].tolist())
    with open(reports / "coverage_curve_test.csv", "w", newline="") as f:  # accuracy vs coverage, margin fixed
        w = csv.writer(f)
        w.writerow(["min_prob", "min_margin", "coverage", "selective_accuracy", "other_false_accept"])
        for min_prob in np.arange(0.3, 1.0, 0.05):
            m = selective_metrics(test_p, test_y, labels, float(min_prob), th["min_margin"]) if len(test_y) else {}
            w.writerow([round(float(min_prob), 2), th["min_margin"], m.get("coverage"), m.get("selective_accuracy"), m.get("other_false_accept")])
    per_class = {}
    for i, label in enumerate(labels):
        support = int(confusion[i].sum())
        tp = int(confusion[i, i])
        predicted = int(confusion[:, i].sum())
        per_class[label] = {"support": support, "recall": tp / support if support else None,
                            "precision": tp / predicted if predicted else None}
    (reports / "metrics.json").write_text(json.dumps({
        "eval": metadata["eval"], "thresholds_calib": th, "per_class_test": per_class,
        "history": history, "manifest": manifest_stats}, indent=2) + "\n", encoding="utf-8")
