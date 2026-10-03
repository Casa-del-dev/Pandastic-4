# Contracts between agent A (Android/UI) and agent B (ML/data) — v0

Change only through a ledger message that the other agent acknowledges. Bump the version line when you change it.
**Version: v0 (A, 2026-10-04 02:00 CEST): proposed. B: ack or amend.**

## 1. Leaf image classifier

Files (produced by B, shipped in `android/app/src/main/assets/models/`):
- `leaf_classifier.onnx`: input `input` float32 `[1,3,224,224]`; output `logits` float32 `[1,N]`. Opset 17, static shape.
- `leaf_classifier.json`: metadata. **The single source of truth for labels and thresholds; A never hard-codes them.**

```json
{
  "version": "leaf-v0",
  "arch": "mobilenetv4_conv_small",
  "input_size": 224,
  "resize": "direct_bilinear",
  "mean": [0.485, 0.456, 0.406],
  "std":  [0.229, 0.224, 0.225],
  "labels": ["coffee_healthy", "coffee_rust", "coffee_miner", "coffee_cercospora", "coffee_phoma", "other"],
  "temperature": 1.0,
  "thresholds": { "min_prob": 0.70, "min_margin": 0.25 },
  "per_class_min_prob": {},
  "eval": { "test_set": "JMuBEN (dedup, pHash)", "n": 0, "accuracy": 0, "coverage_at_threshold": 0, "selective_accuracy": 0 }
}
```

Preprocessing (both sides must match): decode → apply EXIF orientation → RGB → **resize directly to 224×224 (bilinear, no crop)** → `x/255` → `(x-mean)/std` → NCHW.
Postprocessing (A): `p = softmax(logits / temperature)`; top1/top2; margin = p1 − p2.

Label naming: `<crop>_<condition>`, crop ∈ `coffee | maize | bean`, plus `other` (not a supported plant/photo).
Full target set (P1): coffee `healthy, rust, miner, cercospora, phoma`; maize `healthy, fall_armyworm, streak_virus, lethal_necrosis, leaf_blight, leaf_spot`; bean `healthy, angular_leaf_spot, rust`; `other`. P0 may ship coffee + `other` only.

## 2. Resolver (A, Java): order of checks

1. Quality gate (A): blur (variance of Laplacian on 256-px grayscale) or luminance out of range → `RETAKE`.
2. top1 == `other` → `UNSUPPORTED`.
3. Crop from the question/NLU disagrees with the label prefix, or the top two labels are from different crops with margin < min_margin → `ASK_CROP`.
4. p1 ≥ (per_class_min_prob[label] ?? min_prob) **and** margin ≥ min_margin → `CONFIDENT`, else `UNCERTAIN`.
5. Text only (SMS without a photo): intent `diagnose` → `TEXT_ONLY` (**never** CONFIDENT); intent `price` → `PRICE`, or `PRICE_STALE` if the newest row is older than 120 days, or `NO_DATA`.

`escalate = true` for every status except `CONFIDENT` (healthy or disease) and `PRICE`.

Decision object (Java → UI via the bridge; also the input to the SMS formatter):
```json
{ "status": "CONFIDENT|UNCERTAIN|UNSUPPORTED|RETAKE|ASK_CROP|TEXT_ONLY|PRICE|PRICE_STALE|NO_DATA",
  "crop": "coffee|maize|bean|unknown", "label": "coffee_rust", "prob": 0.84,
  "runner_up": "coffee_cercospora", "runner_up_prob": 0.09,
  "lang": "sw", "advice_sms": "...", "advice_long": "...",
  "source": { "id": "plantwise:coffee-rust-01", "title": "...", "url": "..." },
  "price": { "commodity": "...", "low": 0, "high": 0, "currency": "UGX", "unit": "KG", "date": "2025-09", "source_id": "..." },
  "escalate": true }
```

Status texts (RETAKE, UNSUPPORTED, "not sure — ask a person"…) are **app strings owned by A** (`res/values*/strings.xml`, EN + SW). Disease/pest advice is **knowledge data owned by B**.

## 3. `knowledge.sqlite` (B builds; A ships it in assets and opens it read-only)

```sql
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);          -- schema_version='1', built_at, country='UG'
CREATE TABLE sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT, url TEXT,
                     licence TEXT, accessed TEXT);
CREATE TABLE advice(label TEXT NOT NULL,                      -- classifier label, e.g. 'coffee_rust'
                    lang TEXT NOT NULL,                       -- 'en' | 'sw' | 'lg'
                    sms TEXT NOT NULL,                        -- en/sw: <=120 GSM-7 chars (A adds the prefix + safety line)
                    long TEXT NOT NULL,                       -- in-app text, <=600 chars, numbered steps OK
                    source_id TEXT NOT NULL REFERENCES sources(id),
                    translation TEXT NOT NULL,                -- 'original' | 'machine' | 'machine+reviewed'
                    PRIMARY KEY(label, lang));
CREATE TABLE prices(id INTEGER PRIMARY KEY,
                    commodity TEXT NOT NULL,                  -- 'maize_grain' | 'beans_dry' | 'coffee_arabica_parchment' | 'coffee_robusta_kiboko' | 'coffee_robusta_faq'
                    country TEXT NOT NULL, admin1 TEXT, market TEXT,
                    pricetype TEXT,                           -- 'Wholesale' | 'Retail' | 'Farm-gate'
                    unit TEXT NOT NULL, currency TEXT NOT NULL,
                    price_low REAL NOT NULL, price_high REAL NOT NULL,
                    date TEXT NOT NULL,                       -- ISO 'YYYY-MM' or 'YYYY-MM-DD'
                    source_id TEXT NOT NULL REFERENCES sources(id),
                    derived INTEGER NOT NULL DEFAULT 0);      -- 1 = computed, not published
CREATE TABLE lexicon(lang TEXT NOT NULL, term TEXT NOT NULL,  -- lowercase; matched as substring of normalised SMS
                     slot TEXT NOT NULL,                      -- 'intent' | 'crop' | 'symptom'
                     value TEXT NOT NULL);                    -- e.g. ('sw','kahawa','crop','coffee'), ('sw','bei','intent','price')
```
Intents: `diagnose | price | planting | help | other`. Every row in `advice` and `prices` must have a `source_id`. Nothing is invented; derived numbers set `derived=1`.

## 4. NLU model (P1, B) — optional; A's keyword NLU (from `lexicon`) is the fallback

Input: raw SMS text (lowercased, whitespace-collapsed). Output per head: `{label: prob}` for `intent`, `crop` (+ optional `symptom`). Delivery format is B's choice (ONNX with a string input, or a compact linear model + a reference implementation written down here). If the top intent prob is < its threshold, A uses `help`, which replies with the menu.

## 5. Optional LLM (P2)

Qwen3.5-0.8B Q4_K_M via llama.cpp, used for **NLU only** (SMS text → the JSON slots in §4) under a GBNF grammar whose enums come from `leaf_classifier.json` labels + the intents above. It never writes advice text.
