"""Copies the real material the video shows into video/media/ (git-ignored): the app screenshots (status bar cropped,
since the emulator's Wi-Fi icon would wrongly suggest the app uses it), the two held-out RoCoLe test photos, the
plant-pixel masks the app's quality gate computes for them, and the fonts (Archivo, Fragment Mono; SIL OFL)."""
import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MEDIA = Path(__file__).resolve().parent / "media"
(MEDIA / "fonts").mkdir(parents=True, exist_ok=True)

FONTS = {"archivo.woff2": "@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
         "fragment-mono.woff2": "@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2"}
for name, path in FONTS.items():
    if not (MEDIA / "fonts" / name).exists():
        urllib.request.urlretrieve(f"https://cdn.jsdelivr.net/npm/{path}", MEDIA / "fonts" / name)

# App screens (Android emulator, 1080 × 2400); the top rows are the status bar.
SHOTS = {"hello": ("demo/01-chat-hello", 96), "rust": ("demo/03-photo-rust", 96), "notsure": ("demo/04-photo-not-sure", 96),
         "blurry": ("demo/05-photo-blurry", 96), "notleaf": ("demo/06-photo-not-a-leaf", 96),
         "price": ("demo/08-chat-price", 96), "sms": ("04-sms-thread", 64)}
for name, (shot, top) in SHOTS.items():
    im = Image.open(ROOT / f"docs/screenshots/{shot}.png").convert("RGB")
    im.crop((0, top, im.width, im.height)).save(MEDIA / f"shot-{name}.png")

# The photos the app was given in the blurry and not-a-leaf screens, cut out of those screenshots.
for name, box in {"blurry": (640, 560, 1008, 1226), "notleaf": (342, 480, 1007, 974)}.items():
    Image.open(ROOT / f"docs/screenshots/demo/{'05-photo-blurry' if name == 'blurry' else '06-photo-not-a-leaf'}.png") \
        .convert("RGB").crop(box).save(MEDIA / f"in-{name}.jpg", quality=92)


def plant_mask(im):
    """QualityGate.plantShare: a 64 × 64 copy; a pixel is plant if not too dark or grey and its hue is 47-162°."""
    a = np.asarray(im.resize((64, 64), Image.BILINEAR), np.float32) / 255
    mx, mn = a.max(2), a.min(2); chroma = mx - mn
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    c = np.where(chroma == 0, 1, chroma)
    hue = np.where(mx == r, ((g - b) / c) / 6, np.where(mx == g, (2 + (b - r) / c) / 6, (4 + (r - g) / c) / 6))
    hue = np.where(hue < 0, hue + 1, hue)
    ok = (mx >= 0.12) & (chroma / np.where(mx == 0, 1, mx) >= 0.18) & (hue >= 0.13) & (hue <= 0.45)
    return ok


shares = {}
for name, photo in {"rust": "C6P13E2", "healthy": "C3P4E1"}.items():  # RoCoLe (CC BY 4.0), held-out test plants
    im = ImageOps.exif_transpose(Image.open(ROOT / f"data/raw/rocole/photos/{photo}.jpg")).convert("RGB")
    im.thumbnail((720, 1280))
    im.save(MEDIA / f"leaf-{name}.jpg", quality=92)
    app = im.copy(); app.thumbnail((640, 640))  # the WebView sends a 640 px JPEG
    ok = plant_mask(app)
    rgba = np.zeros((64, 64, 4), np.uint8)
    rgba[ok] = (140, 214, 160, 120)   # plant: tinted, the leaf shows through
    rgba[~ok] = (20, 28, 24, 215)     # not plant: blacked out
    Image.fromarray(rgba, "RGBA").save(MEDIA / f"mask-{name}.png")
    shares[name] = round(float(ok.mean()), 2)
(MEDIA / "plant_share.json").write_text(json.dumps(shares))
print("plant share (app rule):", shares)
print("media ready:", sorted(p.name for p in MEDIA.iterdir()))
