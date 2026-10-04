# Pandastic: project memory for Claude sessions

Maintained by agent B (ledger task T50); last updated 2026-10-04 08:05 UTC. **`LEDGER.md` is the source of truth for
live work: read it after every pull.** Details live in `docs/`. Update this file when the codebase changes in a way
that makes something here wrong.

## What it is

Hackathon entry for **Small AI for Development** (World Bank Youth Summit × Hack-Nation, agriculture track). An
offline farm helper that runs on one 4 GB Android phone. Noor (coffee, maize, beans; Uganda/UGX as the stand-in,
Swahili first, English too) texts the helper phone from her basic phone with its ordinary SMS app, no Pandastic app
needed (`P 1 12000` = "is 12,000 a fair coffee price?", or a symptom in her own words; verified with Google
Messages on the emulators), and gets an SMS reply in the same thread within seconds. At home, a leaf photo is classified on
the phone. Questions and answers never use the internet: transport is carrier SMS only. The INTERNET permission is
used for one thing, the opt-in language-model download over mobile data (user decision: Noor's house has no Wi-Fi;
`ModelDownloader`, Android DownloadManager, size + SHA-256 checked against `ml/llm/model.json`, from the GitHub
release `models-v1`); the WebView blocks every network load. Models pick labels and slots; every fact the farmer
reads is a template or a cited advice row. In the helper's chat only, a model may also reword the fixed answer
(`ReplyWriter`, checked word by word in code, shown above the fixed answer); automatic SMS always get the fixed text.

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
   Never reformat `LEDGER.md` (it is in `.prettierignore`). A reformatted copy once wiped 7 entries. The ledger was
   compacted at 06:35 UTC at the user's request (full earlier version: `git show de35257:LEDGER.md`); on a rebase
   conflict there, keep the compacted version and re-append only your own lines. Open requests are its items O1–O8.
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
  keywords recognised, or the LLM recognised with a keyword crop). Personal messages from the same allowed numbers
  ("Habari mwanangu, shule inaendaje?") get no reply; they stay in the normal SMS app and the log keeps only `personal`,
  not the text. A message that is only a help request gets the menu ("nisaidie", "what can you do"; a farming word
  next to it counts), but "nisaidie pesa ya ada" stays personal; plain greetings get no reply (214928a).
- **Phone modes:** *Basic* (SMS chat + Settings, no models) and *Capable* (chat with on-phone questions,
  camera/gallery, Models page with file import and the opt-in download, opt-in automatic SMS replies to allowlisted
  numbers, contacts chosen from a search dropdown, read-aloud, dictation). Dictation is offline on both: Whisper Tiny
  Q5_1 (32 MB, whisper.cpp, bundled; fetched at build by `scripts/fetch-whisper-tiny.mjs`, needs `node` + CMake).
- **Bridge additions (additive, A):** `modelDownload('start'|'cancel')` → `{ok, error}`; `modelStatus().download` =
  `{state: none|queued|running|paused|verifying|done|failed, bytes, total, name, reason?, error?}`, `pandastic:models`
  events every 1.5 s while it runs. `make e2e` reads the method list from `type Native` in `frontend/src/native.ts`.

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
frontend/src/                        App, Chat, Settings, ContactPicker, PhoneSetup, Models, native.ts (bridge + browser
                                     demo), local-phone.ts (browser phone pair), i18n, useDictation, useReadAloud
ml/modal_app.py                      leaf pipeline on Modal (fetch → manifest → cache → train → ensemble ...)
ml/leaf/                             config, data, train, install, class_thresholds, crop_floors, photo_stats, probe_*, quantize, smoke
ml/llm/                              eval sets, eval_llm, retrieval_eval, gen_train, train_lora; slots.gbnf,
                                     system_prompt.txt, model.json (url, size, sha256 of the fine-tuned GGUF) are
                                     bundled into the APK by app/build.gradle: editing them changes the app
ml/modal_lora.py, ml/build_knowledge.py, ml/fetch_prices.py, ml/reports/ (eval reports, model reports)
data/                                advice.json (cited EN+SW), lexicon.csv (200 rows), prices_*.csv, sources.csv
scripts/                             android-emulator.sh, bridge-e2e.mjs, sms-lab.mjs, contacts-e2e.mjs,
                                     human_test_prep.py, install-qwen.mjs, create-basic-avd.mjs, emulator-audio.mjs
```

## Models in the app

**Leaf classifier `leaf-p2-mix-efficientnetb0-ens3-a16129a8`** (installed by B for O1 after the emulator check, a6845f7):

- 3 × EfficientNet-B0 (timm, ImageNet-pretrained, 3 seeds) averaged inside one ONNX file. Weights stored as int8,
  compute in fp32, 12.7 MB. Same I/O contract: `input` [1,3,224,224], direct bilinear resize, ImageNet mean/std,
  output `logits` [1,14]. The app sets ORT `session.disable_quant_qdq`.
- Labels: coffee `healthy rust miner cercospora phoma`, maize `healthy leaf_blight leaf_spot fall_armyworm
  streak_virus`, bean `healthy angular_leaf_spot rust`, `other`. Temperature 0.933, `min_prob` 0.40, `min_margin` 0,
  `per_class_min_prob` coffee_healthy 0.99, maize_healthy 0.98, other maize labels 0.82, bean_healthy 0.54. These
  were **chosen on calib photos run through the app on the emulator** (each crop ≥ 90% right; each healthy label ≥ 99%
  precision), because the app's photo path shifts this model's probabilities (see below).
- Training data: BRACOL (Brazil), JMuBEN (Kenya close-ups), RoCoLe (Ecuador phone photos, split by plant, half
  trained on), CCMT (Ghana maize), iBean (Uganda beans), PlantDoc, Caltech-101 (non-plant `other`, split by
  category). Licences: `docs/DATA.md`.
- Held-out test photos **through the real app on the emulator** (`scripts/photo-eval.mjs`), answered / right when
  answered / sick called healthy, vs the previous ens3: coffee RoCoLe 360 photos 65.0% / 97.4% / 0 (ens3 59.4% /
  96.7% / 3); maize CCMT 336 79.2% / 90.6% / 0 (89.9% / 87.1% / 0); beans iBean 129 100% / 96.1% / 1 (96.9% / 96.8% /
  0); non-crop photos 1/137 answered (0). `checkPhoto` 80 ms median in the page on the emulator (ens3 45 ms).
- **App path ≠ laptop path for this model:** `LeafClassifier` resizes 640 → 224 px with
  `Bitmap.createScaledBitmap(…, true)` (no antialiasing); training uses PIL's antialiased resize. ens3 matched the
  laptop within ±0.01, EfficientNet did not: with the floors as trained, 8/161 rust leaves were called healthy in the
  app (laptop estimate: 5). Judge future leaf models with `scripts/photo-eval.mjs` on an emulator. Not tried: an
  antialiased resize in the app (would need both models re-checked).
- Previous model `leaf-p2-mix-ens3-0483c29f` (3 × MobileNetV4-Conv-Small, 7.7 MB): in git at cff9e12. Measured and not
  shipped: input 288/320/384 px, int8 activations (−3 pts), flip TTA (+0.6 pt for 3× compute), MobileNetV4-Conv-Medium
  (worse), the JSON-only ens3 maize floor (branch `b/leaf-ens3-maize`).
- Coffee does not transfer across countries: a model never trained on RoCoLe answers 1.2% of its photos.

**SMS understanding:** `KeywordNlu` (`data/lexicon.csv`; function words pick sw/en, default sw; crop-aware
symptoms) + optional **Qwen3.5-0.8B Q4_K_M** via llama.cpp + GBNF (`LlmNlu`, 20 s budget). **Chat writer:** an
optional `Qwen3.5-2B-Q4_K_M.gguf` (1.28 GB, side-loaded into `files/models/`, A, ddbd89a) rewords the helper's chat
replies when present; otherwise the 0.8B does; reading SMS stays with the 0.8B (`docs/LLM-WRITING.md`). Prefers the LoRA file `Qwen3.5-0.8B-pandastic-Q4_K_M.gguf` (542 MB) over the base `Qwen3.5-0.8B-Q4_K_M.gguf`
(533 MB). Side-loaded, imported from a file, or downloaded in the app; never committed. **The model reads every
message** (user decision, fddc272) and each reply ends with one template line "AI ya simu imeelewa: bei, kahawa,
12,000." naming only what it read too (`decision.understood`, `decision.nlu`). Which reading wins is unchanged: the
model's intent only when no intent keyword matched, and a symptom only if it is the fine-tune, the SMS reports a
problem, the keywords found the crop, `crop_symptom` is a real label and not "healthy". Crop, offer, language and
commodity always come from keywords. Generation stops after the symptom (O4, 661c39a: grammar cut at `,"`, JSON
closed in Java): 35% fewer tokens, 220/220 eval SMS read the same (`ml/reports/llm_stop_after_symptom_*.md`); 4.2–5 s
per LLM call on the emulator. "Same reply" on held-out /
fresh / fresh2 (fresh2 = the honest set): **98% / 95% / 93%**, keywords alone 76% / 88% / 83% (held-out found the
"p1 13000" fix, so it is no longer untouched for that rule). Retrieval (BM25, e5-small, RAG) was measured and not shipped; the RetrievalNlu fallback was dropped by the user (`DATA.md` §2.4).

**knowledge.sqlite** (~370 KB, built by `ml/build_knowledge.py` from `data/`): cited advice per label (EN + SW),
UCDA/MAAIF coffee farm-gate prices and WFP maize/bean prices with source and date, and the lexicon.

## Commands

```sh
./run.sh                       # two Android emulator phones (5554 capable helper, 5556 basic) + SMS carrier; --web = browser pair 5173/5174
make run | run-device | release | web | stop
make e2e                       # every bridge call inside the running app
make sms-setup / sms-relay / sms-test   # SMS lab on two emulators (sms-test 17/17)
make human-test                # reset both phones + test photos (docs/HUMAN-TEST.md)
cd android && ./gradlew testDebugUnitTest            # 75 JVM tests (Windows: gradlew.bat); -Pnollm builds without llama.cpp
node scripts/photo-eval.mjs photos.csv [out.csv]     # held-out photos (path,label) through the real app on an emulator
python ml/build_knowledge.py                          # rebuild + validate knowledge.sqlite

cd ml   # leaf pipeline (Modal, L4); same args resume; run id = hash(manifest, hparams, code)
modal run --detach modal_app.py --stage all --labels p2 [--coffee-split mix|xc] [--seed N] [--input-size N] [--arch timm_name] [--lr X]
modal run modal_app.py --stage ensemble --labels p2 --version m1,m2,m3
modal run modal_app.py --stage reeval|probs|photo-stats --labels p2 [--version v]   # probs → artifacts/<v>/probs.json
python -m leaf.crop_floors artifacts/<v> [--write]   # per-crop minimum probability from probs.json (laptop path)
python -m leaf.app_floors CALIB.csv [TEST.csv]       # floors from photo-eval CSVs (the app's own path; used for install)
modal volume get pandastic-models leaf/<version> ./artifacts/ && python -m leaf.install artifacts/<version>
python -m leaf.smoke | leaf.probe_photos <dir> | leaf.probe_nonplant <dir>... | leaf.class_thresholds <dir> --label L --precision P [--write]
python ml/llm/eval_llm.py --rescore                   # NLU eval from saved predictions (needs NluEvalTest output)
python ml/llm/stop_eval.py --server llama-server --model x.gguf   # full vs cut grammar on all eval SMS (O4)
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

## Status (08:05 UTC)

- **Done:** SMS hub (T01), resolver/templates/keyword NLU (T02), ONNX runner + gate + bridge (T03), knowledge base
  (T11), stub → real classifier (T10/T13/T15), Qwen JNI + LoRA policy (T30/T31), connector tests (T41),
  model management UI (T42), browser phone pair + launcher (T43/T46/T47), TTS (T44), human-test kit (T45),
  dictation/read-aloud/Qwen install (T48), contacts + own number (T49), photo + words judged together (cff9e12),
  helper answers only farming SMS (HubPolicy, 1d24063), opt-in LLM download native side (6122039), contact search
  dropdown + immediate allowlist confirm (T51/T52, C), "P1 13000" read as a price code (91a8e16), help-only SMS get
  the menu + README/DEMO refresh (O3/O5, A, 214928a), LLM reads every message (fddc272), offline Whisper dictation
  (58c200c, C), LLM stops after the symptom (O4, B, 661c39a), **EfficientNet-B0 leaf model installed after the
  emulator check (O1, B, a6845f7)**.
- **Open:** **download UI** (C, requested by A 06:28: ask once on a Capable phone without a model, ~540 MB of mobile data;
  Models page button, progress, cancel, plain errors; add `modelDownload` to `type Native`); UI refactor (T40/T04, C); demo script + video (T20, `docs/DEMO.md`); human-test sessions (were waiting on
  T49, now landed); antialiased 640 → 224 resize in `LeafClassifier` (optional, A; would need both models
  re-checked); `CLAUDE.md` upkeep (T50, B). T14 dropped; T32 stretch.
- **Not validated:** real carrier SMS (delays, multipart, Ugandan filtering), speed and memory on a real 4 GB phone,
  the hub surviving Doze/OEM battery killers overnight, Basic mode on a 0.5–1 GB phone, Android < 15 on a real device.
  The Swahili text is machine-written and needs a native speaker's review.

## Where to look

`README.md` (pitch, run) · `LEDGER.md` (tasks, log) · `docs/contracts/README.md` (classifier/resolver/sqlite/LLM/Java
API) · `docs/DATA.md` (sources, licences, every measured result, what the data doesn't cover) · `docs/AUDIT.md`,
`docs/AUDIT-B.md` (design review) · `docs/TESTING.md` (SMS lab, what's validated) · `docs/DEMO.md` (install, LLM
side-load, scenarios, video) · `docs/HUMAN-TEST.md` · `frontend/README.md` · `ml/README.md` · `ml/reports/`.
