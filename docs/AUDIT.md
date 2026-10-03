# Audit: handoff + SMS dispatch plan (before implementation)

Author: agent A · 2026-10-04 ~02:00 CEST · Inputs: `bin/plans/peraparation-for-handoff.md` (handoff), `bin/plans/sms-dispatch-preparation.md` (SMS plan), `bin/docs/hackaton-challenge.pdf` (brief), current code in `android/` and `frontend/`.

## 0. Verdict

The product idea is right: photo → small classifier → fixed-label report → deterministic resolver → cited advice, plus an SMS bridge from Noor's basic phone to the daughter's smartphone. **The plan is too big for the time left and has several items that fail the brief's own rules.** Fix these before writing code:

1. **Time.** The competition weekend is 3–4 Oct; we have roughly one day. The plan has 5 classifier heads, ~12 image datasets, STT, MT, RAG, LoRA and XGBoost. Cut to the P0/P1/P2 tiers in §5.
2. **MiniCPM5-1B is English + Chinese only** (model card), so it can't do the required local-language interaction. Its Q4_K_M file is 688 MB, which with KV cache and runtime breaks a 1 GB model budget.
3. **The LLM is not needed for the core.** Once the classifier, resolver, templates and GBNF enums decide everything, the 1B model only rephrases text. That costs 0.5–0.7 GB, an NDK build (no NDK installed here), latency and hallucination risk. The brief rewards model files "small enough to side-load or send over a weak connection". **Core = ~20 MB of models, no LLM.** The LLM becomes an optional P2 for parsing messy free-text SMS.
4. **The SMS plan gates on the LLM's self-reported confidence (≥ 0.75).** That number is not calibrated, and it contradicts the handoff's own rule that the model never judges its own certainty. Confidence must come from calibrated classifiers. A text-only symptom description never yields a confident diagnosis.
5. **The SMS plan appends an invented price** ("Fair Floor: KSh 265/kg", in Kenyan shillings, while the handoff picks Uganda/UGX) to every disease reply. Remove it. Prices come only from SQLite rows that carry a source and a date.
6. **The SMS hub auto-replies to anyone.** That drains airtime and can loop with carrier or bank short codes. Add a sender allowlist and a rate limit.
7. **The SMS code doesn't match the repo:** Kotlin + Room + coroutines in an `org.worldbank.ondera` package, while the repo is Java in `org.pandastic.relay`. Write it in Java. Never use a `worldbank` package name, because it implies endorsement.
8. **Frontend:** RAM is not the problem; the UX is. Keep React in the WebView (it is already bundled inside the APK), run every model natively in Java, and redesign the UI for Noor (§4).

## 1. Brief constraints → status

| Brief rule | Plan today | After fixes |
| :-- | :-- | :-- |
| Runs on a device the user already has | Daughter's Android phone + Noor's basic phone (SMS) ✔ | same |
| Core feature works offline | ✔ (no cloud) | same. Demo with mobile data **off** and SMS **on** (airplane mode would kill SMS) |
| Model files small enough to side-load | ✘ ~790 MB | **P0 ≈ 20–40 MB**; the optional LLM adds 533 MB |
| ≥1 interaction in a named local language | ✘ MiniCPM5 is EN/ZH; whisper-tiny has no Luganda | **Swahili text** (SMS + UI), with pre-translated, fixed answers. Luganda is our "less-supported language" case (§3, S6) |
| Human in the loop; flag uncertainty ("not sure — ask a person") | Partly; the SMS gate uses LLM self-confidence ✘ | Calibrated thresholds + resolver statuses; every non-confident path says "ask a person, don't spray yet" |
| Avoid hallucinations / fixed list of answers | Handoff ✔ (enums); SMS plan ✘ (free text + invented price) | All user-facing text = templates + cited snippets keyed by label |
| Cite data: source, licence, size, **what it doesn't cover** (scored) | 8 licences still say "check" | B fills them before submission; drop any dataset we can't license-check |
| Pass/fail: privacy, consent, bias, oversight | SMS logs PII to logcat and syncs to the coop without consent ✘ | No PII in logs; local-only log; export is opt-in; delete button |

## 2. Handoff audit (`peraparation-for-handoff.md`)

| # | Sev | Finding | Fix |
| :- | :- | :-- | :-- |
| H1 | BLOCKER | Scope vs ~1 day: 5 heads, 12 image sets, STT, MT, RAG, LoRA, XGBoost | Tiers in §5. P0 = coffee leaf classifier + SMS hub + advice + prices + fail-safe |
| H2 | HIGH | MiniCPM5-1B: Apache-2.0 but **EN + ZH only**; Q4_K_M = 688 MB file | If an LLM is used at all: **Qwen3.5-0.8B** (Apache-2.0, 201 languages, Q4_K_M 533 MB). Text use only |
| H3 | HIGH | RAM table peaks at 1.25 GB, which exceeds the 1 GB model budget. MiniCPM's 1.1 GB alone exceeds it | Budget table in §6. Measure on the device and put the measured number in the video |
| H4 | HIGH | The LLM adds little once classifier + resolver + templates + enums decide the answer | LLM-free core; LLM = P2 NLU (free-text SMS → JSON slots) behind GBNF |
| H5 | MED | Router + shared trunk + 4 heads is too much engineering for the weekend | **One flat classifier** with crop-prefixed labels + `other`. Crop = label prefix. Resolver unchanged (ASK_CROP still works with the text hint) |
| H6 | MED | whisper-tiny: no Luganda, weak Swahili; MMS is CC BY-NC | Voice input = P2. Voice **output** via Android TTS if a Swahili voice is installed (verify on the phone) |
| H7 | MED | Opus-MT in the loop is unnecessary if the answers are a fixed list | Pre-translate the templates; mark each row `translation = machine / machine+reviewed / original` (honesty is scored) |
| H8 | MED | 8 datasets with licence "check" | Fill in or drop. Write the licence and size into `ml/reports/` and the video |
| H9 | MED | Country mismatch: handoff = Uganda/UGX, SMS plan = KSh. The Fairtrade 2026 figures are unverified | **Uganda / UGX** (WFP Uganda has maize + beans; UCDA/MAAIF reports give coffee farm-gate prices). Verify the Fairtrade numbers or drop them. Keep the staleness rule |
| H10 | LOW | arXiv 2609.07370 exists but is a *tool-calling* benchmark on Qwen2.5-0.5B/1.5B, TinyLlama, Phi-1.5 and Pythia | Cite it as that, or drop it |
| H11 | MED | "Logged for Sub-county Extension Officer visit" claims a referral system that doesn't exist | Say "Not sure — ask the extension officer or the cooperative. Don't spray yet." Optional: an opt-in, store-and-forward report that the daughter actually sends |
| H12 | LOW | "Airplane mode ON" in Mode 1 | Fine for photo mode only. The SMS hub needs cellular: say "mobile data off" |
| ✔ | — | **Keep:** photo → text report; temperature scaling + thresholds set on a cross-source test (JMuBEN, de-duplicated); crop-prefixed labels; grain mould → "get it tested"; every price row has source + date; the "what the data doesn't cover" list | — |

## 3. SMS plan audit (`sms-dispatch-preparation.md`)

| # | Sev | Finding | Fix |
| :- | :- | :-- | :-- |
| S1 | HIGH | The gate uses the LLM's self-reported confidence | Confidence comes from the calibrated classifier (photo) or the NLU (text). **Text-only symptoms → never CONFIDENT**: "Could be X. Show a leaf photo on the home phone tonight, or ask the officer. Don't spray yet." |
| S2 | HIGH | Hard-coded "Fair Floor: KSh 265/kg" is invented, in the wrong currency, and appended to disease replies | Prices only for the price intent, from `knowledge.sqlite`, with the date + source in the SMS |
| S3 | HIGH | Auto-replies to any sender: airtime drain, loops with short codes | Allowlist of Noor's number(s), set by the daughter in the UI. Ignore alphanumeric/short senders. Rate limit (e.g. ≤10/h, 1 in flight per sender) |
| S4 | HIGH | Lifecycle: the WakeLock taken in the receiver is never released; `startForegroundService` from the background is fragile on Android 12+; runtime permission requests are missing (RECEIVE_SMS, SEND_SMS, POST_NOTIFICATIONS on 33+); `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` is missing for targetSdk 34+; `getSystemService(SmsManager)` needs API 31 (our minSdk is 23) | The daughter turns the hub **on from the UI** (a user action, so the FGS start is allowed). The FGS stays up with a persistent notification and holds its own WakeLock per job. The receiver only enqueues (the SMS broadcast's temporary allowlist is a backup). Restart on BOOT_COMPLETED; prompt for the battery-optimisation exemption; use `SmsManager.getDefault()` below API 31 |
| S5 | MED | Kotlin/Room/coroutines; `org.worldbank.ondera` | Java + `SQLiteOpenHelper` + a single-thread executor (sequential inference), in package `org.pandastic.relay.hub` |
| S6 | MED | Encoding: Luganda's **ŋ** is not in GSM-7, so the whole SMS becomes UCS-2 (**70 chars/segment**). Swahili is GSM-7 safe. `take(157)+"..."` can cut off the safety line | Templates pre-sized and checked for GSM-7 at build time. `divideMessage` + `sendMultipartTextMessage`, capped at 2 segments. **Safety line first** |
| S7 | MED | 48 vs 60 tokens; a `"\n"` stop token breaks JSON | Moot unless P2. Then GBNF with no newline stop |
| S8 | MED | Promises "< 15 s" | Delivery time depends on the carrier. Report the time we measured |
| S9 | MED | PII (sender + body) in logcat; coop sync without consent | No PII in logs; local log; opt-in export; delete |
| S10 | LOW | READ_PHONE_STATE unused; `priority=999` is irrelevant (SMS_RECEIVED can't be aborted) | Remove |
| S11 | LOW | The demo script shows an invented treatment ("copper fungicide before rains") | Show the cited snippet text instead |
| ✔ | — | **Dev/demo tool:** the emulator fakes inbound SMS with `adb emu sms send 0700000001 "majani ya kahawa yana unga wa njano"`, so we can test without SIMs and keep a backup demo | — |

## 4. Frontend + "does it fit in 1 GB?"

* **RAM:** the React bundle is ~200 KB. The WebView renderer costs ~100–200 MB, but it runs in a separate process and only while the UI is open. The SMS hub runs headless in the FGS, so Noor's SMS flow never loads the WebView. **Models must run natively** (Java + ONNX Runtime Android, from a prebuilt Maven AAR, so no NDK is needed), never in JS (no transformers.js or onnxruntime-web: that would double memory and run slower). If the target phone has ~1 GB **total** RAM (Android Go), drop the LLM for good; the P0 stack still fits easily.
* **"Integrate in the app?"** It already is: Gradle builds React and bundles it into the APK, served offline by `WebViewAssetLoader`. We add a `@JavascriptInterface` bridge (`classifyPhoto`, `askText`, `hubStatus`, `setHub`) and keep React for speed of iteration. A native rewrite is not worth the risk at this point.
* **UX is the real problem.** The current UI is a desktop chatbot shell (sidebar, breadcrumb, "workspace", "Local models", "AI host", "Frontend preview"), English-only, with an open "Ask anything" box. That invites questions we can't answer safely and confuses low-literacy users.
* **Redesign direction** (marketable, simple, low literacy):
  * Mobile-first, one column, **3 giant tiles**: 📷 *Check a leaf* · 💰 *Check a price* · 📩 *Mama's SMS helper* (hub on/off + today's answered questions).
  * **Swahili first**, English toggle (Luganda later). Icons + 1–3 words per control, ≥ 56 dp tap targets, high contrast, warm earthy palette (coffee cherry red, leaf green, sun yellow). Large rounded cards. A friendly mascot (keep the panda brand, or rename: user decision).
  * Result = **traffic-light card**: green "Healthy", red "Problem: Coffee leaf rust" + 3 numbered steps + source, amber "Not sure — ask a person. Don't spray yet." There is always an **"Ask a person"** button, which pre-fills an SMS to the officer or cooperative number (human in the loop; works offline over SMS).
  * 🔊 **Read aloud** on every card (Android offline TTS).
  * **Viral loop:** a shareable result card (photo + verdict + app name) sent to the cooperative group when data is available, using store-and-forward.
  * Remove: sidebar, breadcrumb, model pages, "preview" badges, the free-text "Ask anything" box.
* **Build env (agent A's machine):** `npm` is missing (only `pnpm` is global), but Gradle's `installFrontend` runs `npm ci`. Fix locally; this is not a repo change.

## 5. Revised scope (tiers)

```
 Noor's basic phone ──SMS──►  SmsReceiver ─► HubService (FGS, allowlist, rate limit, SQLite log)
                                               │
 Daughter's phone UI (React/WebView) ──bridge──┤
   photo ─► QualityGate ─► LeafClassifier(ONNX) ─┐
   text/SMS ─► Nlu (lexicon P0 / model P1) ──────┼─► Resolver (thresholds, statuses, code)
                                                 │      │
                              knowledge.sqlite ◄─┘      ▼
                              (advice+sources+prices)  Decision JSON ─► UI card / ≤2-segment SMS
                                                                         (safety line first)
```

| Tier | Item | Owner |
| :-- | :-- | :-- |
| **P0** | Coffee leaf classifier (BRACOL train → JMuBEN de-duplicated test; temperature + thresholds; ONNX) on **Modal** | B |
| **P0** | `knowledge.sqlite`: coffee advice EN+SW with sources; Uganda prices (maize, beans from WFP; coffee from UCDA/MAAIF) with source + date; SW/EN lexicon | B |
| **P0** | SMS hub (Java FGS, receiver, allowlist, rate limit, log, multipart send) + Resolver + templates + keyword NLU | A |
| **P0** | ONNX Runtime runner + quality gate + JS bridge | A |
| **P0** | UI redesign (§4) | A |
| **P0** | Eval report (cross-source accuracy, abstain rate, confusion matrix) + datasets/licences/"doesn't cover" doc | B |
| **P1** | Maize + bean classes + `other` in the same flat model | B |
| **P1** | NLU model (intent/crop/symptom) for SW+EN SMS, synthetic data labelled as synthetic, trained on Modal | B |
| **P1** | Demo script + video assets | A + B |
| **P2** | Qwen3.5-0.8B Q4 + llama.cpp JNI + GBNF (needs NDK) + LoRA on Modal | whoever is free |
| **P2** | STT, maize grain head, FAMEWS alerts, XGBoost + weather | — |

Suggested checkpoints (CEST, to be adjusted once we know the exact submission time): **10:00** end-to-end path working with stub models · **14:00** real coffee model in the APK · **17:00 feature freeze** · then the video.

## 6. Model / RAM budget (estimates; measure on the device)

| Component | Disk | Peak RAM | Tier |
| :-- | :-- | :-- | :-- |
| Leaf classifier, MobileNetV4-Conv-Small, ONNX (fp32 ≈ 15 MB, int8/fp16 ≈ 4–8 MB) | ≤ 15 MB | 30–60 MB | P0 |
| ONNX Runtime Android native lib (per ABI, in the APK) | ~10–15 MB | ~30 MB | P0 |
| Quality gate (Java, Laplacian variance + luminance) | 0 | < 10 MB | P0 |
| `knowledge.sqlite` | < 5 MB | < 10 MB | P0 |
| NLU text model | < 5 MB | < 20 MB | P1 |
| **P0 + P1 total** | **≈ 40 MB** | **≈ 150 MB** | |
| Optional LLM: Qwen3.5-0.8B Q4_K_M (llama.cpp) | 533 MB | ~0.7–0.9 GB | P2 |

## 7. Training on Modal (agent B)

* Prerequisite (**user action**): on B's machine run `pip install modal && modal token new` (browser login). Agents can't do the OAuth step. On A's machine `pip` and `modal` are not installed.
* Layout: `ml/modal_app.py` (image + Volumes `pandastic-data`, `pandastic-models`), `ml/train_leaf.py`, `ml/export_onnx.py`, `ml/build_knowledge.py`, `ml/reports/`.
* Download the datasets inside Modal straight to the Volume (Mendeley / Dataverse / GitHub). De-duplicate JMuBEN with a perceptual hash **before** splitting. Augment BRACOL (white background) with field-style backgrounds.
* timm `mobilenetv4_conv_small` (ImageNet-pretrained) on one L4/A10G. Temperature scaling on a val split. Thresholds (min prob, min margin) chosen on the **cross-source** test for a target selective accuracy. Report coverage vs accuracy, which is the "evidence it works" part.
* Export ONNX opset 17 with static shape `[1,3,224,224]`, plus metadata JSON (see `docs/contracts/README.md`). Get artifacts with `modal volume get`. The classifier (≤ 15 MB) may be committed to `android/app/src/main/assets/models/` so the APK is reproducible. LLM weights are never committed.

## 8. Decisions needed from the user (defaults below are used unless overridden)

1. **"1 GB"**: is it the model RAM budget on a ~4 GB phone (default) or the phone's total RAM? Total RAM would remove P2 for good.
2. **Stand-in country / language:** Uganda (UGX) + **Swahili** text (default); Luganda as the less-supported example.
3. **Brand:** keep "Pandastic" + panda mascot (default) or rename the product for the pitch?
4. **Modal auth** on agent B's machine (user must run `modal token new`).
5. **Exact submission time** (timezone), so we can fix the freeze checkpoint.
