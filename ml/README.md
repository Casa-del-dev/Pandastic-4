# ml/ — models and knowledge data (agent B)

Everything here produces files the Android app loads from `android/app/src/main/assets/models/`
(formats in [docs/contracts/README.md](../docs/contracts/README.md)). Nothing in the app needs a network connection.

## Setup

```sh
python -m venv ml/.venv
source ml/.venv/bin/activate          # Windows (Git Bash): source ml/.venv/Scripts/activate
pip install numpy onnx onnxruntime pillow pandas requests pypdf imagehash timm modal
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

All commands below assume the venv is active, so `python` is the venv's Python on Linux, macOS and Windows.

## Knowledge base (`knowledge.sqlite`, shipped)

| Step | Command | Output |
| :-- | :-- | :-- |
| Refresh prices from the official sources | `python ml/fetch_prices.py` | `data/prices_coffee_ucda.csv`, `data/prices_wfp_uga.csv` |
| Build + validate the database | `python ml/build_knowledge.py` | `assets/models/knowledge.sqlite` |

Advice text lives in `data/advice.json`, sources in `data/sources.csv`, keywords in `data/lexicon.csv`.
The build fails if any row lacks a source, any SMS text is not GSM-7 or longer than 120 characters,
or a lexicon value is not a known label/intent.

## Leaf classifier (trained on Modal)

The app ships a **stub** (`ml/make_stub_classifier.py`, `"stub": true`) until a trained model is installed.

```sh
cd ml
python -m leaf.smoke                         # CPU end-to-end check with synthetic images (~1 min)
modal token new                              # once per machine
modal run --detach modal_app.py --stage all --labels p2                     # fetch -> manifest -> cache -> train (L4)
modal run --detach modal_app.py --stage all --labels p2 --coffee-split xc   # RoCoLe never trained on: cross-country test
modal run modal_app.py --stage reeval --labels p2 --version <version>       # re-score a model (adds by_crop / by_source)
modal volume get pandastic-models leaf/<version> ./artifacts/
python -m leaf.probe_photos artifacts/<version>   # run it on RoCoLe phone photos, exactly as the app would (no GPU)
python -m leaf.install artifacts/<version>        # replaces the stub, copies reports to ml/reports/
```

Improving and checking a model (all on held-out data, through the app's photo path where it matters):

```sh
modal run --detach modal_app.py --stage train --labels p2 --seed 14              # another member of the same recipe
modal run modal_app.py --stage ensemble --labels p2 --version leaf-...,leaf-...,leaf-...   # average them into one ONNX
modal run modal_app.py --stage photo-stats --labels p2   # the app's QualityGate numbers on every test photo
python -m leaf.class_thresholds <dir> --label coffee_healthy --precision 0.98 --write   # stricter healthy floor (calib)
modal run modal_app.py --stage probs --labels p2 --version <v>   # calib+test probabilities -> artifacts/<v>/probs.json
python -m leaf.crop_floors <dir> --write                  # per-crop floor: each crop >= 90% right on calib (maize)
modal run --detach modal_app.py --stage train --labels p2 --arch efficientnet_b0.ra_in1k [--seed N]   # other backbone
python -m leaf.probe_nonplant <dir> [<dir> ...]           # CONFIDENT answers on random everyday photos
python -m leaf.quantize <dir>                             # int8 check (not shipped: -3 pts top-1)
```

Label sets: `p0` coffee only; `p1` + maize leaf blight / grey leaf spot (PlantDoc) + bean classes (iBean);
`p2` + healthy maize, fall armyworm, streak virus (CCMT, Ghana). A relaunch with the same arguments resumes from the
last epoch (run id = hash of manifest, hyper-parameters and code).

What the pipeline does (`ml/leaf/`):

- **Data** (`config.py`, `data.py`): coffee from BRACOL (Brazil, whole leaves on white paper), JMuBEN + JMuBEN2
  (Kenya, 128 px lesion close-ups) and **RoCoLe** (Ecuador, smartphone photos of leaves on the plant, split by
  plant); PlantDoc (CC BY 4.0) and iBean (Uganda, MIT) as bean/maize classes or `other`; CCMT raw maize photos
  (Ghana, CC BY 4.0); Caltech-101 (objects, animals, scenes, CC BY 4.0) as non-plant `other`, split by category.
  All CC BY 4.0 unless noted. Mendeley blocks cloud IPs, so `resolve_ccmt.py` and
  `resolve_rocole.py` (run once from a normal connection) list each image's public S3 URL. JMuBEN is full of rotated
  and flipped copies (the 8,336 rust images are 632 distinct patches), so images are grouped by a rotation/flip-
  invariant perceptual hash and groups never cross splits. BRACOL's published zip is truncated: about 1,400 of its
  1,747 images can be read.
- **Coffee split** (`--coffee-split`): `mix` (default) trains on 50% of RoCoLe's plants and tests on 25% others
  (same source); `xc` never trains on RoCoLe. A model without RoCoLe in training answers ~1% of RoCoLe photos:
  whole leaves on paper and lesion close-ups don't teach it what a leaf on the plant looks like (`docs/DATA.md`).
- **Training** (`train.py`): timm `mobilenetv4_conv_small` (ImageNet-pretrained), class-balanced sampling,
  BRACOL white backgrounds replaced by field photos, flips/rotations/colour/blur augmentation, images pre-shrunk to
  320 px once (`cache` stage), per-epoch checkpoints, early stopping.
- **Calibration**: temperature scaling on the validation split; `min_prob` / `min_margin` chosen on the *calib*
  split for the highest coverage at ≥ 90% selective accuracy with ≤ 5% of `other` photos accepted; numbers reported
  only on the separate *test* split, overall, `by_crop` and `by_source` (which sources were trained on is in
  `test_set`).
- **Export**: ONNX opset 17, input `input` `[1,3,224,224]`, output `logits`, checked against PyTorch
  (max |diff| < 1e-3), plus `leaf_classifier.json` and `reports/` (metrics, confusion matrix, coverage curve).

## SMS understanding (keywords + optional Qwen3.5-0.8B)

```sh
cd android && ./gradlew testDebugUnitTest --tests '*NluEvalTest*' && cd ..   # keyword scores + predictions
python ml/llm/eval_llm.py --server <llama-server> --model <gguf> [--report-name nlu_eval_lora --predictions-dir ml/reports/lora]
python ml/llm/eval_llm.py --rescore            # re-score saved predictions, no model needed
cd ml && modal run modal_lora.py               # LoRA fine-tune on an A100, GGUF Q4_K_M, eval
```

Sets in `ml/llm/`: `eval_sms.csv` (dev, tunes the lexicon), `eval_sms_heldout.csv`, `eval_sms_fresh.csv` (used to
find keyword bugs after its first score) and `eval_sms_fresh2.csv` (never used to fix anything: the honest one).
`same reply` in the report counts SMS that get exactly the right reply (`help` and `other` share the menu).
Results and the hybrid policy: `ml/reports/nlu_eval.md`, `docs/DATA.md` §2.3.
