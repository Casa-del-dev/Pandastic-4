"""Copies the real material the video shows into video/media/ (git-ignored): the app screenshots (status bar cropped,
since the emulator's Wi-Fi icon would wrongly suggest the app uses it) and the two held-out RoCoLe test photos."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MEDIA = Path(__file__).resolve().parent / "media"
MEDIA.mkdir(exist_ok=True)
for name, shot in {"rust": "03-photo-rust", "notsure": "04-photo-not-sure", "blurry": "05-photo-blurry",
                   "notleaf": "06-photo-not-a-leaf", "price": "08-chat-price"}.items():
    im = Image.open(ROOT / f"docs/screenshots/demo/{shot}.png").convert("RGB")
    im.crop((0, 96, im.width, im.height)).save(MEDIA / f"shot-{name}.png")
for name, photo in {"rust": "C6P13E2", "healthy": "C3P4E1"}.items():  # RoCoLe (CC BY 4.0), held-out test plants
    im = ImageOps.exif_transpose(Image.open(ROOT / f"data/raw/rocole/photos/{photo}.jpg")).convert("RGB")
    im.thumbnail((720, 1280))
    im.save(MEDIA / f"leaf-{name}.jpg", quality=92)
print("media ready:", sorted(p.name for p in MEDIA.iterdir()))
