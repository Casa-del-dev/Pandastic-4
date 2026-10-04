# Contracts between agent A (Android/UI) and agent B (ML/data) — v0

Change only through a ledger message that the other agent acknowledges. Bump the version line when you change it.
**Version: v0.1 (A, 2026-10-04 ~02:30 CEST): B's amendments from `docs/AUDIT-B.md` applied, §6 Java API added, LLM moved to P1 (user decision). B: ack in the ledger.**

Device fact (user-confirmed): the daughter's phone has **4 GB RAM total**. Keep all models together under ~1 GB peak resident (Android + other apps use the rest).

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

Price offer (B's A1): the NLU pulls the offered number out of the text with a regex (`12000`, `12,000`, `12k`, `12.5k`), per kg unless the text says otherwise. `offer` is `null` when there is none. `gap_pct = (offer − price_low) / price_low × 100`, **computed in Java, never by a model**. `stale` = the newest row is older than 120 days.

Decision object (Java → UI via the bridge; also the input to the SMS formatter):
```json
{ "status": "CONFIDENT|UNCERTAIN|UNSUPPORTED|RETAKE|ASK_CROP|TEXT_ONLY|PRICE|PRICE_STALE|NO_DATA",
  "crop": "coffee|maize|bean|unknown", "label": "coffee_rust", "prob": 0.84,
  "runner_up": "coffee_cercospora", "runner_up_prob": 0.09,
  "lang": "sw", "advice_sms": "...", "advice_long": "...",
  "source": { "id": "plantwise:coffee-rust-01", "title": "...", "url": "..." },
  "price": { "commodity": "...", "low": 0, "high": 0, "currency": "UGX", "unit": "KG", "date": "2025-09", "source_id": "...",
             "offer": 12000, "gap_pct": -25.0, "stale": false },
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
CREATE TABLE lexicon(lang TEXT NOT NULL, term TEXT NOT NULL,  -- lowercase
                     slot TEXT NOT NULL,                      -- 'intent' | 'crop' | 'symptom'
                     value TEXT NOT NULL,                     -- e.g. ('sw','kahawa','crop','coffee'), ('sw','bei','intent','price')
                     match TEXT NOT NULL DEFAULT 'prefix');   -- 'token' (whole word) | 'prefix' (word starts with term) | 'substring'
```
Intents: `diagnose | price | planting | help | other`. Every row in `advice` and `prices` must have a `source_id`. Nothing is invented; derived numbers set `derived=1`.

SMS short codes (B's A3), all `match='token'`: `1` = coffee, `2` = maize, `3` = beans, `p` / `bei` = price, `?` / `msaada` = help. The `help` reply is a numbered menu.

Build rules (B's A4): no FTS5 or other virtual tables (Android's SQLite lacks FTS5); `PRAGMA journal_mode=DELETE`; `PRAGMA user_version = 1`. A copies the asset to `getDatabasePath()` on first run and whenever `meta.built_at` changes.

## 4. NLU model (P1, B) — optional; A's keyword NLU (from `lexicon`) is the fallback

Input: raw SMS text (lowercased, whitespace-collapsed). Output per head: `{label: prob}` for `intent`, `crop` (+ optional `symptom`). Delivery format is B's choice (ONNX with a string input, or a compact linear model + a reference implementation written down here). If the top intent prob is < its threshold, A uses `help`, which replies with the menu.

## 5. LLM: Qwen3.5-0.8B (P1, user decision 2026-10-04)

- Model: `Qwen3.5-0.8B` GGUF `Q4_K_M` (533 MB, Apache-2.0, 201 languages) via llama.cpp JNI (NDK r28c `28.2.13676358`, CMake `3.22.1`). Weights are never committed; they are side-loaded to `getFilesDir()/models/` (download script in `ml/`).
- `n_ctx` is set explicitly to ≤ 2048 (B's A6). Text only; the vision tower is not used, because photo confidence must come from the calibrated classifier.
- Role: **NLU only.** Messy SMS text → the slots in §4 (`intent`, `crop`, `symptom`, `offer`) under a GBNF grammar whose enums come from `leaf_classifier.json` labels + the intents above. **It never writes advice or price text.** Those still come from `knowledge.sqlite` + templates.
- The keyword NLU stays as the fallback (model missing, timeout > 8 s, or grammar output that fails the checks in code).
- Optional LoRA on Modal (B) once the user gives the go for training.

## 6. Java API inside `android/app/src/main/java/org/pandastic/relay/brain/`

File ownership: **A** = `ClassifierResult`, `LeafClassifier`, `QualityGate`, `LlmNlu` (+ `cpp/`). **B** = `Decision`, `Knowledge`, `Nlu`, `Resolver`, `SmsFormatter`, `Templates`, `Brain`, plus `android/app/src/test/`. A owns `app/build.gradle` and already adds `junit` + `onnxruntime-android`; ask A for other dependencies.

```java
// A: pure Java value type (no android.* imports), produced by LeafClassifier
public final class ClassifierResult {
  public final String modelVersion;
  public final String[] labels;              // order from leaf_classifier.json
  public final float[] probs;                // softmax(logits / temperature)
  public final float minProb, minMargin;
  public final java.util.Map<String, Float> perClassMinProb;
}
// A
public final class QualityGate { public static String check(android.graphics.Bitmap b); }  // null = ok, else "blur" | "dark" | "bright"
public final class LeafClassifier implements AutoCloseable {
  public LeafClassifier(android.content.Context c) throws Exception;   // loads assets/models/leaf_classifier.{onnx,json}
  public ClassifierResult classify(android.graphics.Bitmap b);
}

// B: all pure Java and JVM-testable, except Knowledge's Android implementation
public final class Brain {
  public Brain(Knowledge k, Nlu nlu);
  public Decision answerText(String text, String lang);                 // lang null = auto-detect (sw/en)
  public Decision answerPhoto(String qualityIssue, ClassifierResult r, String text, String lang);
}
public interface Nlu { Slots parse(String text, String lang); }         // B: KeywordNlu; A: LlmNlu implements the same interface
public final class Slots {                                              // B: pure value type
  public String lang, intent, crop, symptom;                            // enums from §3/§4; null = not found
  public Double offer;                                                  // offered price per kg, or null
  public float intentProb;                                              // 1.0 for keyword hits
}
public final class SmsFormatter { public static String format(Decision d); }   // safety line first; ≤ 2 segments checked with SmsMessage.calculateLength at runtime
public final class Decision { public String toJson(); }                // fields as in §2
```

Threading: A calls `Brain` from one single-thread executor (the hub and the UI bridge share it), so `Brain` doesn't need to be thread-safe.
