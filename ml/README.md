# ml/ — models and knowledge data (agent B)

Everything here produces files the Android app loads from `android/app/src/main/assets/models/`
(formats in [docs/contracts/README.md](../docs/contracts/README.md)). Nothing in the app needs a network connection.

## Setup

```sh
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install numpy onnx onnxruntime pillow pandas requests pypdf imagehash timm modal
ml/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

## Knowledge base (`knowledge.sqlite`, shipped)

| Step | Command | Output |
| :-- | :-- | :-- |
| Refresh prices from the official sources | `ml/.venv/Scripts/python ml/fetch_prices.py` | `data/prices_coffee_ucda.csv`, `data/prices_wfp_uga.csv` |
| Build + validate the database | `ml/.venv/Scripts/python ml/build_knowledge.py` | `assets/models/knowledge.sqlite` |

Advice text lives in `data/advice.json`, sources in `data/sources.csv`, keywords in `data/lexicon.csv`.
The build fails if any row lacks a source, any SMS text is not GSM-7 or longer than 120 characters,
or a lexicon value is not a known label/intent.

## Leaf classifier (ready to train, not trained yet)

The app ships a **stub** (`ml/make_stub_classifier.py`, `"stub": true`) until the real model is trained.

```sh
cd ml
../ml/.venv/Scripts/python -m leaf.smoke                 # CPU end-to-end check with synthetic images (~1 min)
modal token new                                          # once per machine
modal run modal_app.py --stage all --labels p0           # fetch -> manifest -> train on an L4 GPU
modal run modal_app.py --stage train --smoke             # cheap 30-step GPU check first, if you prefer
modal volume get pandastic-models leaf/<version> ./artifacts/
../ml/.venv/Scripts/python -m leaf.install artifacts/<version>   # replaces the stub, copies reports to ml/reports/
```

What the pipeline does (`ml/leaf/`):

- **Data** (`config.py`, `data.py`): BRACOL (Brazil, CC BY 4.0) for training; JMuBEN + JMuBEN2 (Kenya, CC BY 4.0)
  as the **cross-country** test; PlantDoc (CC BY 4.0) and iBean (Uganda, MIT) as `other`. JMuBEN is full of rotated
  and flipped copies (the 8,336 rust images are 632 distinct leaves), so images are grouped by a rotation/flip-invariant
  perceptual hash, one image per leaf is kept, and groups never cross splits. BRACOL's published zip is truncated
  (no central directory): about 1,400 of its 1,747 leaf images can be read, and the "mixed stress" class is excluded.
- **Training** (`train.py`): timm `mobilenetv4_conv_small` (ImageNet-pretrained), class-balanced sampling,
  BRACOL white backgrounds replaced by field photos, flips/rotations/colour/blur augmentation.
- **Calibration**: temperature scaling on the validation split; `min_prob` / `min_margin` chosen on the Kenyan
  *calib* half for the highest coverage at ≥ 90% selective accuracy with ≤ 5% of `other` photos accepted;
  numbers reported only on the separate *test* half.
- **Export**: ONNX opset 17, input `input` `[1,3,224,224]`, output `logits`, checked against PyTorch
  (max |diff| < 1e-3), plus `leaf_classifier.json` and `reports/` (metrics, confusion matrix, coverage curve).
