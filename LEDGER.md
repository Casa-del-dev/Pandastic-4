# Coordination ledger (three agents, one repo)

All agents read this file before starting any work and after every pull. `CLAUDE.md` holds the project summary
(architecture, models, numbers, commands); this file holds **who does what now**.
**Feature freeze ~10:30 UTC, submission ~13:00 UTC, 2026-10-04.** Model install decisions by ~08:30 UTC.

> **Compacted 06:35 UTC by B at the user's request.** The full previous ledger (90 log entries, 23:58–06:28 UTC, every
> task row verbatim) is in git: `git show de35257:LEDGER.md`. Nothing was dropped that is still open: open requests
> are under **Open items**, finished work under **Done**. **If your rebase conflicts on this file, keep this version
> and re-append only your own new lines at the bottom of the message log.**

## Agents

| ID | Git author / machine | Owns |
| :- | :-- | :-- |
| **A** | mpelossi, Linux | `android/` native side (hub, `LeafClassifier`, `QualityGate`, `LlmNlu`, `cpp/`, `NativeBridge`, `BrainHost`, `ModelDownloader`), `docs/` (except `DATA.md`), `scripts/`, `Makefile`, `README.md`; tests every frontend↔native connector (`make e2e`, SMS lab); emulator check before any model install |
| **B** | Luca Apolloni, Windows | `ml/`, `data/`, `docs/DATA.md`, `CLAUDE.md`; brain files `Brain`, `Resolver`, `Templates`, `KeywordNlu`, `Nlu`, `Slots`, `Decision`, `Knowledge`, `SmsFormatter` + `android/app/src/test/` (contracts §6) |
| **C** | ehomburg (Codex) | `frontend/` (main developer for UI + UX), `run.sh`; native changes only on the user's explicit request, as additive bridge methods A acks |

The bridge (`frontend/src/native.ts` `type Native` ↔ `NativeBridge.java`) is a shared contract: change it only via a
message here that A acks (`make e2e` reads the method list from `type Native`). Modal: A's account (profile
`blackdollar23`) and Luca's (profile `luca`, workspace `lapolloni`) have separate volumes; announce runs here and
never launch the same run on both.

## Protocol

1. **Sync loop:** `git pull --rebase --autostash origin main` before you read this file, before you claim, and before
   every commit. Push right after every commit. Commit small and often.
2. **Claim before work:** add or edit your own task row (`owner`, `status=claimed`), commit only `LEDGER.md` as
   `ledger: <ID> claim <task>`, push. If the push is rejected, pull, re-read, and pick another task if someone else
   claimed it.
3. **Status values:** `todo` → `claimed` → `in-progress` → `review` → `done` (or `blocked: <reason>`). Update the
   `Updated` column (UTC, `date -u +%H:%M`, never local time) every time.
4. **Stay in your dirs.** For someone else's file, ask here. Shared contracts (`docs/contracts/README.md`, the bridge)
   change only with a message + the owner's ack.
5. **Edit only your own task rows; the message log is append-only** (newest at the bottom, `[A|B|C HH:MM]`). Never
   rewrite another agent's lines. Exception: a compaction the user asks for (rule 9).
6. **Never commit** datasets, LLM weights (`*.gguf`), `local.properties`, secrets, Modal tokens. Allowed binaries:
   `android/app/src/main/assets/models/leaf_classifier.onnx` (≤ 15 MB) + `.json` and `knowledge.sqlite` (≤ 5 MB).
7. Don't commit the user's unrelated local changes. Don't run Prettier (or any formatter) on `LEDGER.md`: it is in
   `.prettierignore`, and a reformatted stale copy once wiped 7 entries.
8. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commands posted for others must be
   OS-neutral (A: Linux, B: Windows).
9. **Compaction:** only when the user asks. The compacting agent names the commit holding the full previous version at
   the top and carries over every open item; the others keep the compacted version on conflict.

## Open items (who acts next)

- **O1 · A · leaf model, by 08:30.** Emulator check, then merge one branch (each touches only the two asset files +
  `ml/reports/<version>/`):
  - `b/leaf-effb0-ens3` (B recommends): `leaf-p2-mix-efficientnetb0-ens3-a16129a8`, 3 × EfficientNet-B0, 12.7 MB, same
    I/O contract, per-crop maize floor 0.85 (`ml/leaf/crop_floors.py`: each crop ≥ 90% right on calib). Held-out, vs
    installed ens3: all test photos 91% answered / 96.3% right (87% / 93.9%); RoCoLe phone photos 91% / 97.3% (63% /
    96.9%), rust called healthy 5 vs 4 of 161; maize 81% / 92.2% (96% / 86.0%); beans 100% / 96.9% (100% / 97.7%);
    other plants accepted 0.5% (1.6%); human-test photos 4/4 confident and right (3/4). Costs: ~3.5× compute (laptop
    29 vs 8 ms per photo, please measure on the emulator); 1/117 random photos passes the plant gate confidently
    (raspberries → fall armyworm 0.86; ens3: 0).
  - `b/leaf-ens3-maize` (fallback): installed ens3 unchanged except the JSON's maize floor 0.75 (maize 78% / 90.8%).
- **O2 · C · download UI** (user decision; A's request 06:28; native side in 6122039). Add
  `modelDownload(action: 'start' | 'cancel'): string` to `type Native`. It returns `{ok, error:
  phone_mode|storage|installed|unavailable|action}` at once; `modelStatus().download` = `{state:
  none|queued|running|paused|verifying|done|failed, bytes, total, name, reason?: no_network|wifi_only|retrying|other,
  error?: network|size|checksum|storage}`; `pandastic:models` events every 1.5 s while it runs. (1) On a **Capable**
  phone with no model (`modelStatus().language.installed === false`), ask once: "Download the language helper? About
  540 MB of mobile data, once. It lets the phone understand messages in more ways (e.g. Luganda, mixed words).
  Everything else works without it." [Download] [Not now]. (2) Models page: Download button, progress (bytes/total),
  Cancel, plain errors (no network → "waiting for network, it continues by itself"; storage → "needs about 600 MB
  free"). Import from a file stays as the offline alternative. `scripts/human_test_prep.py --no-model` leaves the model out to
  test this.
- **O3 · A · help requests get no SMS reply** under HubPolicy: `nisaidie` (help me), `how does this work`, `hello,
  what can you do`. B suggests adding `nisaidie|saidia|what can you do|how does (this|it) work|how to use` to
  `ASKS_FOR_MENU`. Plain greetings staying silent looks right.
- **O4 · A · optional LLM speed-up:** stop generation at `,"commodity"` and close the JSON in Java (LlmNlu reads only
  intent + symptom): ~30% less generation, ~2 s of ~8 s on the emulator, eval unchanged. Queued after production checks.
- **O5 · A · stale docs:** README's "Leaf classifier" row and "Limits" (still BRACOL/coffee-only/placeholder; now 14
  labels, coffee + maize + beans, 3-model ensemble); `docs/DEMO.md` §5 still lists "Grain mould → get it tested",
  which the app doesn't do.
- **O6 · C · small screen:** on the Basic AVD (720×1280) the first-run screen hid the Endelea/Continue button below
  the language toggle (A, 04:57). Not confirmed fixed.
- **O7 · A · human-test sessions:** ready (`./run.sh` once, `make human-test` before each tester). Report problems as
  log lines with the task # and ⚠️ when a tester believed an uncertain answer.
- **O8 · all · T20 demo video** (2–5 min, `docs/DEMO.md` §5), and a native speaker's review of the Swahili strings.

## Task board

Open rows:

| ID | Task | Owner | Status | Files / dirs | Updated (UTC) | Notes |
| :- | :--- | :---- | :----- | :----------- | :------------ | :---- |
| T20 | Demo script + video (emulator `adb emu sms send` backup) | A + B | todo | `docs/DEMO.md` | — | Script in DEMO.md §5; video not recorded |
| T40 | Frontend UI + UX refactor and optimisation (Noor: low literacy, Swahili first, 4 GB phone, offline WebView) | C | todo | `frontend/` | 02:58 | Took over T04; ongoing through T42–T52 |
| T53 | O1: leaf model check (emulator if B's machine can run one, else JVM/ONNX checks) + install decision | B (user request, was A) | claimed | assets `leaf_classifier.*`, `ml/reports/` | 06:49 | A: please don't merge either leaf branch meanwhile |
| T54 | O3: help requests (`nisaidie`, "what can you do", "how does this work") get the menu by SMS | B (user request, was A) | claimed | `hub/HubPolicy.java` + test | 06:49 | |
| T55 | O4: LLM stops after the symptom, JSON closed in Java (~30% less generation) | B (user request, was A) | claimed | `brain/LlmNlu.java` (+ JNI only if needed) | 06:49 | |
| T56 | O5: stale README leaf row + Limits; DEMO.md §5 grain mould | B (user request, was A) | claimed | `README.md`, `docs/DEMO.md` | 06:49 | |
| T50 | `CLAUDE.md`: compact project memory, kept current | B | done (maintained) | `CLAUDE.md` | 06:35 | User request; ledger compacted 06:35 (user request) |
| T32 | STT, maize grain head, FAMEWS alerts, XGBoost + weather | — | todo | — | — | Stretch; only if everything else is done |

Done (one line each; details in git and the archived ledger):

| ID | What | Owner | Result |
| :- | :--- | :---- | :----- |
| T00 | Audit, contracts v0.1, scope + split | A (+ B's AUDIT-B A1–A10) | `docs/AUDIT.md`, `docs/AUDIT-B.md`, `docs/contracts/README.md` |
| T01 | SMS hub: receiver, foreground service, allowlist, rate limit (10/sender/h, 30/h), log, multipart, boot restart | A | Farming-only replies (HubPolicy, 1d24063); reply in the SMS's own language (e46c80c) |
| T02 | Brain, Resolver, Templates EN/SW, KeywordNlu, SmsFormatter + JVM tests | B | Additive Decision fields acked (HELP, title, message, candidates…); "P1 13000" price code (91a8e16) |
| T03 | ONNX runner, QualityGate, bridge, Brain integration | A | Plant-share gate 0.05 (e834c9d, cff9e12); photo + words judged together (cff9e12) |
| T04 | First UI redesign | A → C | Superseded by C's chat-first UI (T42) |
| T10/T13/T15 | Leaf pipeline (Modal), P2 labels (coffee, maize, beans), RoCoLe `mix` split, Caltech-101 non-plants, healthy floors, ensembles | B (A ran early runs) | Stub → `leaf-p2-mix-eff20277` (4bb2d68) → **`leaf-p2-mix-ens3-0483c29f` installed (cff9e12)**; see O1 |
| T11 | `knowledge.sqlite` builder: cited advice EN+SW, UCDA/MAAIF + WFP prices, lexicon | B | ~370 KB, 200 lexicon rows (Luganda crop words included) |
| T12 | `docs/DATA.md` + eval reports | B | Maintained: sources, licences, every measured result, limits |
| T14 | Own NLU model | B | Dropped: keyword + Qwen hybrid instead |
| T30 | Qwen3.5-0.8B via llama.cpp JNI + GBNF (`LlmNlu`), prefix cache, background load | A | LoRA policy (b) (af9e490); opt-in download native side (6122039) |
| T31 | GBNF + prompt, SMS eval sets (dev/heldout/fresh/fresh2), LoRA on Modal | B (A ran it) | `lora-20261004-0119`, 542 MB GGUF on GitHub release `models-v1` |
| T41 | Connector tests: `make e2e`, SMS lab (`make sms-*`), `docs/TESTING.md` | A | Carrier script; Google Messages → helper → reply verified on emulators |
| T42 | Chat-first UI, camera/gallery in composer, Models page | C | Model name + fine-tuned import hint shown |
| T43/T46/T47 | Browser phone pair (5173/5174), `./run.sh` launcher: two Android emulators + carrier | C | `./run.sh` (Android, default) / `--web` |
| T44/T48 | Native TTS; native dictation, read-aloud buttons, emulator audio, Qwen install | A / C | Live transcription unverified; `scripts/dictation-e2e.mjs` |
| T45 | Human-test kit (`docs/HUMAN-TEST.md`, `make human-test`) | A | EXIF fix; phones keep their own Contacts, SMS history wiped (e406235) |
| T49/T51/T52 | Contacts from the address book, own number, search dropdown, immediate allowlist confirm | C | `scripts/contacts-e2e.mjs` |

## Decisions in force

- D1 Core works **without** the LLM (classifier + resolver + cited templates + SQLite); the LLM only reads the SMS
  (NLU) and never writes advice. *(A)*
- D2 LLM = **Qwen3.5-0.8B** Q4_K_M. *(user)*
- D3 Uganda / UGX stand-in; Swahili text first; Luganda as the "less supported" example. *(A)*
- D4 Java, package `org.pandastic.relay`, no Kotlin/Room. D5 React UI in a WebView, models native, JS bridge. *(A)*
- D6 Confidence only from calibrated classifiers; text-only symptoms never CONFIDENT; no invented prices. *(A)*
- D7 Training on **Modal**. D8 Phone = **4 GB RAM**, all models < ~1 GB peak. D9 Freeze 10:30 UTC, submission
  ~13:00 UTC. *(user)*
- D10 **LLM policy** (measured, `ml/reports/nlu_eval_lora.md`): keywords first; the model gives the intent only when
  no intent keyword matched, and a symptom only if it is the fine-tuned file, the SMS reports a problem, the keywords
  found the crop, `crop_symptom` is a label and not healthy; never crop, offer, language or commodity. *(A + B)*
- D11 The hub replies in the SMS's own language (`lang = null`, Swahili when unclear). *(B, done by A)*
- D12 No vector database / RetrievalNlu: measured, not shipped (`DATA.md` §2.4). *(user, via B)*
- D13 The helper auto-replies **only to farming SMS**; personal ones get no reply and are logged without text. *(user, via A)*
- D14 **Opt-in LLM download over mobile data** on Capable phones; INTERNET is used for that only; the WebView blocks
  network loads. *(user, via A)*
- D15 Leaf models: B proposes on a branch with held-out numbers through the app's photo path; A merges after the
  emulator check. A false "healthy" is the worst answer, so `*_healthy` labels get stricter floors chosen on calib. *(A + B)*

## Timeline (compacted)

- 23:58–00:50 Audit + contracts v0.1; hub + bridge (990aadc); Brain + knowledge.sqlite + stub classifier; Qwen on
  the emulator (3–5 s per SMS); keyword + LLM hybrid measured (held-out 68% → 78%).
- 01:08 User GO for training. Mendeley blocks cloud IPs → S3 mirrors (10f0710). 01:59 LoRA trained. 02:16 MLOps
  pass (057084a: checkpoints/resume, image cache, run ids).
- 02:40 Coffee failure explained: JMuBEN is 128 px lesion patches, BRACOL is leaves on paper; a model never trained on
  RoCoLe phone photos answers 1.2% of them → RoCoLe `mix` split (e205e9a).
- 03:20 First real leaf model `leaf-p2-mix-eff20277` (4bb2d68); `make e2e`; 03:22–03:53 LoRA ships with policy (b).
- 03:42 LEDGER restored after a stale Prettier copy (e8073fe) → `.prettierignore`.
- 04:29 Non-plant photos got confident answers (6/20) → plant-share gate (e834c9d), Caltech-101 as `other`, healthy
  floors, 3-seed ensemble → ens3 installed (cff9e12): 20/20 non-plant photos rejected on the emulator.
- 05:01 Human-test photos reached the app sideways (EXIF dropped) → fixed. 05:32 Photo + words judged together.
- 06:00–06:28 Farming-only hub replies (1d24063) + "P1 13000" fix (91a8e16); EfficientNet-B0 candidate; opt-in
  LLM download (6122039); Noor's ordinary SMS app verified end to end.

## Message log (append-only)

- [B 06:35] **Ledger compacted at my user's request** (105 KB → this). Full previous version: `git show de35257:LEDGER.md`.
  Open requests are now **O1–O8** above (please tick yours off by appending a line here, e.g. "O3 done (abc1234)").
  Task rows: only the open ones keep the full columns; finished ones are one line each under **Done**. Decisions gained
  D10–D15 from the log. **A, C:** pull before your next edit here; on a rebase conflict keep this version and re-append
  only your own new lines.
- [B 06:49] **At my user's request B takes O1, O3, O4 and O5 from A** (rows T53–T56). **A:** please don't start them or
  merge either leaf branch; you keep O7 and the emulator/SMS-lab tests. I'll post results and commits here per item;
  if my machine can't run the emulator for O1, I'll say so and hand the device check back to you.
