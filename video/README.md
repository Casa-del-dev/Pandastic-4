# Technical walkthrough video (57 s)

Code-rendered: every frame of `index.html` is a pure function of time `t`. `render.mjs` steps headless Edge/Chrome
through it, and `build.sh` adds the sound and encodes `out/pandastic-walkthrough.mp4` (1920×1080, 30 fps). The MP4,
the frames and `media/` are git-ignored.

Everything shown is real:

- App screens: `docs/screenshots/demo/` (Android emulator), status bar cropped.
- Leaf photos: held-out RoCoLe test plants C6P13E2 and C3P4E1 (CC BY 4.0). In the app on the emulator they score
  rust 0.98 (confident) and healthy 0.98 (below the 0.99 floor, so "not sure").
- Model output: Qwen3.5-0.8B fine-tuned under the app's grammar, `{"lang":"en","intent":"price","crop":"coffee","symptom":null,"` (19 tokens).
- SMS: the hub's actual reply to `P 1 12000` (11 s on the emulator).
- Numbers: `ml/reports/leaf-p2-mix-efficientnetb0-ens3-a16129a8/app_check.md` and `ml/reports/nlu_eval_lora.md`.

Music: "Warm Fuzz (LoFi, Retro)" by HoliznaCC0, CC0 1.0, from the Free Music Archive. The cuts follow its strong hits
(126.5 BPM). Sound effects are synthesized in `sfx.py`.

```sh
bash video/build.sh            # needs ffmpeg, bun, Python (Pillow, numpy, scipy), Edge or Chrome
bun video/render.mjs --stills 9.9,29   # quick layout check (out/still-*.png)
```
