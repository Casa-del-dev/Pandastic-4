# Pandastic: project memory for Claude sessions

Maintained by agent B (ledger task T50); last updated 2026-10-04 06:27 UTC. **`LEDGER.md` is the source of truth for
live work: read it after every pull.** Details live in `docs/`. Update this file when the codebase changes in a way
that makes something here wrong.

## What it is

Hackathon entry for **Small AI for Development** (World Bank Youth Summit × Hack-Nation, agriculture track). An
offline farm helper that runs on one 4 GB Android phone. Noor (coffee, maize, beans; Uganda/UGX as the stand-in,
Swahili first, English too) texts the helper phone from her basic phone (`P 1 12000` = "is 12,000 a fair coffee
price?", or a symptom in her own words) and gets an SMS reply within seconds. At home, a leaf photo is classified on
the phone. Questions and answers never use the internet: transport is carrier SMS only. The INTERNET permission is
used for one thing, the opt-in language-model download (`ModelDownloader`, Android DownloadManager, SHA-256 checked
against `ml/llm/model.json`); the WebView blocks every network load. Models only pick labels and slots.
Every sentence the farmer reads is a template or a cited advice row.

**Submission ~13:00 UTC 2026-10-04. Feature freeze ~10:30 UTC.** Model install decisions by ~08:30 UTC, so A can
check them on the emulator first.

## Agents and ownership

| Agent | Git author / machine | Owns |
| :-- | :-- | :-- |
| **A** | mpelossi, Linux | `android/` native side (hub, `LeafClassifier`, `QualityGate`, `LlmNlu`, `cpp/`, `NativeBridge`, `BrainHost`), `docs/` (except `DATA.md`), `scripts/`, `Makefile`; tests every UI↔native connector (`make e2e`, SMS lab), runs emulator checks before a model is installed |
| **B** | Luca Apolloni, Windows | `ml/`, `data/`, `docs/DATA.md`, `CLAUDE.md`; brain files `Brain`, `Resolver`, `Templates`, `KeywordNlu`, `Nlu`, `Slots`, `Decision`, `Knowledge`, `SmsFormatter` + `android/app/src/test/` |
| **C** | ehomburg, Codex | `frontend/` (UI + UX only), `run.sh`; native changes only on explicit user request, as additive bridge methods A acks |

B's user: **do not touch frontend/UI** (C's area).

## Rules (LEDGER protocol + user instructions)

1. `git pull --rebase --autostash origin main` before reading `LEDGER.md`, before claiming, and before every commit.
   Push right after every commit. Commit small and often.
2. Claim before work: add or edit **your own** task row, commit only `LEDGER.md` as `ledger: <ID> claim <task>`.
   The message log is append-only, newest last, `[A|B|C HH:MM]` in **UTC** (`date -u +%H:%M`, never local time).
   Never reformat `LEDGER.md` (it is in `.prettierignore`). A reformatted copy once wiped 7 entries.
3. Stay in your dirs; for someone else's file, ask in the log. Shared contracts (`docs/contracts/README.md`, the
   bridge `frontend/src/native.ts` ↔ `NativeBridge.java`) change only with a log message + the owner's ack.
4. **Never commit** datasets, LLM weights (`*.gguf`), `local.properties`, secrets, Modal tokens. The only binaries
   allowed are `android/app/src/main/assets/models/leaf_classifier.onnx` (≤ 15 MB) + `.json` and
   `knowledge.sqlite` (≤ 5 MB). Don't commit the user's unrelated local changes.
5. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
6. Commands posted for others must be OS-neutral (A: Linux/bash, B: Windows, Git Bash + PowerShell).
7. A model claim needs a held-out measurement, and you must say which set. Don't launch a Modal run the other agent
   is already running (each has its own account and volumes).

## Architecture

```text
SMS:   basic phone ─SMS─► SmsReceiver ─► HubService (allowlist, ≤10/sender/h, ≤30/h, log, HubPolicy) ─► BrainHost (one thread)
         ─► Brain.answerText ─► KeywordNlu (+ LlmNlu) ─► Resolver ─► Decision ─► SmsFormatter (safety line first, ≤2 parts) ─► SmsSender
Photo: WebView (EXIF upright, 640 px JPEG) ─► NativeBridge.checkPhoto(id, photo, text, lang) ─► QualityGate ─► LeafClassifier (ONNX)
         ─► Brain.answerPhoto (the words go through the same NLU: crop mismatch → ASK_CROP, contradicting symptom → UNCERTAIN) ─► Resolver
Data:  knowledge.sqlite (cited advice EN+SW, prices, lexicon) ◄── Resolver
```

- **Statuses:** CONFIDENT, UNCERTAIN, UNSUPPORTED, RETAKE, ASK_CROP, TEXT_ONLY, PRICE, PRICE_STALE, NO_DATA.
  `escalate` ("ask a person") for all except CONFIDENT and PRICE. Text alone is **never** CONFIDENT. A price row
  older than 120 days is stale. The offer gap `gap_pct` is computed in Java, never by a model.
- **QualityGate:** blur if the Laplacian variance (256 px) is < 40; dark or bright; **plant share** (green-to-yellow
  pixels, 64 px) < 0.05 → forced `other` → UNSUPPORTED.
- **Resolver order** (contracts §2): gate → `other` → crop check → p1 ≥ `per_class_min_prob[label] ?? min_prob`
  and margin ≥ `min_margin` → CONFIDENT, else UNCERTAIN.
- **HubPolicy:** the helper auto-replies only to farming SMS (menu request, or a price/problem/planting question the
  keywords recognised, or the LLM recognised with a keyword crop). Personal messages from the same allowed numbers get
  no reply and are logged as `personal` without their text.
- **Phone modes:** *Basic* (SMS chat + Settings, no models) and *Capable* (chat with on-phone questions,
  camera/gallery, Models page, opt-in automatic SMS replies to allowlisted numbers, contacts suggestions,
  read-aloud, dictation).

Code map:

```text
android/app/src/main/java/org/pandastic/relay/
  FrontendActivity, NativeBridge (window.PandasticNative), BrainHost, DictationController, PhoneContacts,
  ModelDownloader + DownloadDoneReceiver (opt-in LLM download)
  brain/  Brain Resolver Templates KeywordNlu LlmNlu Nlu Slots Decision Knowledge SqliteKnowledge
          ClassifierResult LeafClassifier QualityGate SmsFormatter
  hub/    SmsReceiver HubService HubPolicy Responder SmsSender SmsStatusReceiver ChatStore HubLog HubPrefs BootReceiver
android/app/src/main/cpp/            llama.cpp JNI (v0.5.0, fetched at build; NDK 28.2.13676358, CMake 3.22.1)
android/app/src/main/assets/models/  leaf_classifier.onnx/.json, knowledge.sqlite
android/app/src/test/                JVM tests (resolver, NLU, SMS formatting, NluEvalTest, PhotoWithTextTest, SmsTriageTest)
frontend/src/                        App, Chat, Settings, PhoneSetup, Models, native.ts (bridge + browser demo),
                                     local-phone.ts (browser phone pair), i18n, useDictation, useReadAloud
ml/modal_app.py                      leaf pipeline on Modal (fetch → manifest → cache → train → ensemble ...)
ml/leaf/                             config, data, train, install, class_thresholds, crop_floors, photo_stats, probe_*, quantize, smoke
ml/llm/                              eval sets, eval_llm, retrieval_eval, gen_train, train_lora, slots.gbnf, system_prompt,
                                     model.json (download url, size, sha256 of the fine-tuned GGUF; GitHub release)
ml/modal_lora.py, ml/build_knowledge.py, ml/fetch_prices.py, ml/reports/ (eval reports, model reports)
data/                                advice.json (cited EN+SW), lexicon.csv (200 rows), prices_*.csv, sources.csv
scripts/                             android-emulator.sh, bridge-e2e.mjs, sms-lab.mjs, contacts-e2e.mjs,
                                     human_test_prep.py, install-qwen.mjs, create-basic-avd.mjs, emulator-audio.mjs
```

## Models in the app

**Leaf classifier `leaf-p2-mix-ens3-0483c29f`** (installed in cff9e12):

- 3 × MobileNetV4-Conv-Small (timm, ImageNet-pretrained, 3 seeds) averaged inside one ONNX file. Weights stored as
  int8, compute in fp32, 7.7 MB. Same I/O contract: `input` [1,3,224,224], direct bilinear resize, ImageNet
  mean/std, output `logits` [1,14]. The app sets ORT `session.disable_quant_qdq` (5 ms vs 15 ms per photo, laptop).
- Labels: coffee `healthy rust miner cercospora phoma`, maize `healthy leaf_blight leaf_spot fall_armyworm
  streak_virus`, bean `healthy angular_leaf_spot rust`, `other`. Temperature 0.914, `min_prob` 0.40, `min_margin`
  0.05, `per_class_min_prob` coffee_healthy 0.99, maize_healthy 0.99, bean_healthy 0.65 (chosen on calib for
  precision: a false "healthy" is the worst answer).
- Training data: BRACOL (Brazil), JMuBEN (Kenya close-ups), RoCoLe (Ecuador phone photos, split by plant, half
  trained on), CCMT (Ghana maize), iBean (Uganda beans), PlantDoc, Caltech-101 (non-plant `other`, split by
  category). Licences: `docs/DATA.md`.
- Held-out results: RoCoLe test plants through the app path: answers 63%, 96.9% of answers right, rust called
  healthy 4/161. iBean 100% answered / 97.7% right. CCMT maize 96% / 86% right, or 93% leading to the right advice
  (half the errors swap blight ↔ grey leaf spot, same advice). Other plants accepted 1.6%; unseen Caltech
  non-plants 1.1%; random everyday photos: 3/117 confident, 0 with the plant gate. On the emulator, 20/20 non-plant
  photos are turned away.
- Measured and not shipped: input 288/320/384 px, int8 activations (−3 pts), flip TTA (+0.6 pt for 3× compute),
  MobileNetV4-Conv-Medium (worse).
- **Candidate, waiting for A's emulator check (branch `b/leaf-effb0-ens3`):** `leaf-p2-mix-efficientnetb0-ens3-a16129a8`,
  3 × EfficientNet-B0, 12.7 MB, + per-crop maize floor 0.85 (`ml/leaf/crop_floors.py`: each crop ≥ 90% right on calib).
  Test: 96.3% right at 91% answered; RoCoLe app path 91% answered / 97.3% right / rust→healthy 5; maize 92.2% at 81%;
  other plants 0.5%. Costs: ~3.5× compute (29 vs 8 ms on a laptop), 1/117 random photos passes the gate confidently.
  Fallback: keep ens3 with a JSON-only maize floor 0.75. Coffee does not transfer across countries: a model never trained on
  RoCoLe answers 1.2% of its photos.

**SMS understanding:** `KeywordNlu` (`data/lexicon.csv`; function words pick sw/en, default sw; crop-aware
symptoms) + optional **Qwen3.5-0.8B Q4_K_M** via llama.cpp + GBNF (`LlmNlu`, 20 s budget, NLU only, never writes
text). Prefers the LoRA file `Qwen3.5-0.8B-pandastic-Q4_K_M.gguf` over the base `Qwen3.5-0.8B-Q4_K_M.gguf` (533 MB,
side-loaded or downloaded in the app, never committed). Policy: the model gives the intent only when no intent keyword matched, and a symptom
only if it is the fine-tune, the SMS reports a problem, the keywords found the crop, `crop_symptom` is a real label
and it is not "healthy". Crop, offer, language and commodity always come from keywords. "Same reply" on held-out /
fresh / fresh2 (fresh2 = the honest set): **98% / 95% / 93%**, keywords alone 76% / 88% / 83% (held-out found the
"p1 13000" fix, so it is no longer untouched for that rule). Retrieval (BM25,
e5-small, RAG) was measured and not shipped; the RetrievalNlu fallback was dropped by the user (`DATA.md` §2.4).

**knowledge.sqlite** (~370 KB, built by `ml/build_knowledge.py` from `data/`): cited advice per label (EN + SW),
UCDA/MAAIF coffee farm-gate prices and WFP maize/bean prices with source and date, and the lexicon.

## Commands

```sh
./run.sh                       # two Android emulator phones (5554 capable helper, 5556 basic) + SMS carrier; --web = browser pair 5173/5174
make run | run-device | release | web | stop
make e2e                       # every bridge call inside the running app
make sms-setup / sms-relay / sms-test   # SMS lab on two emulators (sms-test 17/17)
make human-test                # reset both phones + test photos (docs/HUMAN-TEST.md)
cd android && ./gradlew testDebugUnitTest            # 68 JVM tests (Windows: gradlew.bat); -Pnollm builds without llama.cpp
python ml/build_knowledge.py                          # rebuild + validate knowledge.sqlite

cd ml   # leaf pipeline (Modal, L4); same args resume; run id = hash(manifest, hparams, code)
modal run --detach modal_app.py --stage all --labels p2 [--coffee-split mix|xc] [--seed N] [--input-size N] [--arch timm_name] [--lr X]
modal run modal_app.py --stage ensemble --labels p2 --version m1,m2,m3
modal run modal_app.py --stage reeval|probs|photo-stats --labels p2 [--version v]   # probs → artifacts/<v>/probs.json
python -m leaf.crop_floors artifacts/<v> [--write]   # per-crop minimum probability from probs.json
modal volume get pandastic-models leaf/<version> ./artifacts/ && python -m leaf.install artifacts/<version>
python -m leaf.smoke | leaf.probe_photos <dir> | leaf.probe_nonplant <dir>... | leaf.class_thresholds <dir> --label L --precision P [--write]
python ml/llm/eval_llm.py --rescore                   # NLU eval from saved predictions (needs NluEvalTest output)
modal run modal_lora.py                               # Qwen LoRA (A100) → GGUF + eval
```

On B's Windows machine: the Modal CLI is `ml/.venv/Scripts/modal.exe` (profile `luca`, workspace `lapolloni`); set
`PYTHONUTF8=1 PYTHONIOENCODING=utf-8`; torch/timm/onnxruntime are in `ml/.venv`. Scratch work goes in
`ml/artifacts/` (gitignored).

## Decisions in force

D1 the core works without the LLM · D2 LLM = Qwen3.5-0.8B (user) · D3 Uganda/UGX, Swahili text, Luganda as the
"less supported" example · D4 Java, package `org.pandastic.relay`, no Kotlin/Room · D5 React UI in a WebView, models
native, JS bridge · D6 confidence only from calibrated classifiers; text symptoms never CONFIDENT; no invented
prices · D7 training on Modal (user) · D8 phone = 4 GB RAM, all models < ~1 GB peak (user) · D9 freeze 10:30 UTC,
submission ~13:00 UTC (user). The hub replies in the SMS's own language (`lang = null`).

## Status (compacted ledger, 06:27 UTC)

- **Done:** SMS hub (T01), resolver/templates/keyword NLU (T02), ONNX runner + gate + bridge (T03), knowledge base
  (T11), stub → real classifier (T10/T13/T15, now ens3), Qwen JNI + LoRA policy (T30/T31), connector tests (T41),
  model management UI (T42), browser phone pair + launcher (T43/T46/T47), TTS (T44), human-test kit (T45),
  dictation/read-aloud/Qwen install (T48), contacts + own number (T49), photo + words judged together (cff9e12),
  helper answers only farming SMS (HubPolicy, 1d24063), opt-in LLM download over mobile data (6122039),
  contact search dropdown (T51, C).
- **Open:** leaf candidate effb0-ens3 (A's emulator check, install decision by 08:30); contact/composer follow-ups (T52, C);
  UI refactor (T40/T04, C); demo script + video (T20, `docs/DEMO.md`); human-test sessions (were waiting on
  T49, now landed); optional LLM stop-after-symptom speed-up (~30% generation, queued by A); README's leaf
  classifier row and "Limits" are stale (A's file, flagged); `CLAUDE.md` upkeep (T50, B). T14 dropped; T32 stretch.
- **Not validated:** real carrier SMS (delays, multipart, Ugandan filtering), speed and memory on a real 4 GB phone,
  the hub surviving Doze/OEM battery killers overnight, Basic mode on a 0.5–1 GB phone, Android < 15 on a real device.
  The Swahili text is machine-written and needs a native speaker's review.

## Where to look

`README.md` (pitch, run) · `LEDGER.md` (tasks, log) · `docs/contracts/README.md` (classifier/resolver/sqlite/LLM/Java
API) · `docs/DATA.md` (sources, licences, every measured result, what the data doesn't cover) · `docs/AUDIT.md`,
`docs/AUDIT-B.md` (design review) · `docs/TESTING.md` (SMS lab, what's validated) · `docs/DEMO.md` (install, LLM
side-load, scenarios, video) · `docs/HUMAN-TEST.md` · `frontend/README.md` · `ml/README.md` · `ml/reports/`.
