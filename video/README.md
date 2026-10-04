# Technical walkthrough video (58 s)

Code-rendered: every frame of `index.html` is a pure function of time `t`. `render.mjs` steps headless Edge/Chrome
through it, six samples per frame over half the frame time (a film camera's 180° shutter), and `build.sh` averages
them into motion blur, adds the sound and film grain, and encodes `out/pandastic-walkthrough.mp4` (1920×1080, 30 fps).
The MP4, the frames and `media/` are git-ignored.

Everything shown is real:

- App screens: `docs/screenshots/demo/` and `docs/screenshots/04-sms-thread.png` (Android emulator), status bar
  cropped. The 🤖 lines on them are Qwen3.5-2B's wording, checked by `ReplyWriter`.
- Leaf photos: held-out RoCoLe test plants C6P13E2 and C3P4E1 (CC BY 4.0). In the app on the emulator they score
  rust 0.98 (confident) and healthy 0.98 (below the 0.99 floor, so "not sure"), plant share 0.90 and 0.50. The
  plant-pixel grid is `QualityGate.plantShare`'s rule recomputed on a 64 × 64 copy (`prepare_media.py`).
- Model output: Qwen3.5-0.8B fine-tuned under the app's grammar, `{"lang":"en","intent":"price","crop":"coffee","symptom":null,"`,
  split into its own tokens with `llama-tokenize`; the greyed rest is what the full grammar would have generated.
- SMS: the hub's actual reply to `P 1 12000` (11 s on the emulator).
- Numbers: `ml/reports/leaf-p2-mix-efficientnetb0-ens3-a16129a8/app_check.md`, `ml/reports/nlu_eval_lora.md`,
  `ml/reports/llm_stop_after_symptom_lora.md`, `docs/LLM-WRITING.md` (Qwen3.5-2B, 1.28 GB).

Type: Archivo and Fragment Mono (SIL OFL), fetched by `prepare_media.py`. Music: "Warm Fuzz (LoFi, Retro)" by
HoliznaCC0, CC0 1.0, from the Free Music Archive; the cuts follow its strong hits (126.5 BPM). Sound effects are
synthesized in `sfx.py`.

```sh
bash video/build.sh                     # needs ffmpeg, bun, Python (Pillow, numpy, scipy), Edge or Chrome
bun video/render.mjs --stills 9.9,29    # quick layout check (out/still-*.png)
```
