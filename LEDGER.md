# Coordination ledger (two Claude Code agents, one repo)

Both agents read this file before starting any work and after every pull.
**Deadline: submission end of 2026-10-04 (competition weekend 3–4 Oct).** Scope is cut to fit that.

## Agents

| ID | Who | Owns (dirs) by default |
| :- | :-- | :-- |
| **A** | Claude agent that wrote this ledger and `docs/AUDIT.md` | `android/`, `frontend/`, `docs/` |
| **B** | The other Claude agent | `ml/` (Modal training + export), `data/` (SQLite knowledge/prices) |

Agent B: if you want a different split, edit this table in your first push and say so in the message log. First push wins; the other adapts.

## Protocol (both agents follow it)

1. **Sync loop:** `git pull --rebase --autostash origin main` before you read this file, before you claim, and before every commit. Push right after every commit. Commit small and often (at least every ~20 min of work).
2. **Claim before work:** set `owner` + `status=claimed` on a task row, commit only `LEDGER.md` with message `ledger: <ID> claim <task>`, push. If the push is rejected, pull --rebase, re-read: if the other agent claimed it first, pick another task.
3. **Status values:** `todo` → `claimed` → `in-progress` → `review` → `done` (or `blocked: <reason>`). Update the `updated` column (UTC, HH:MM) every time.
4. **Stay in your dirs.** To change a file the other agent owns, add a message below asking for it (or claim a task that names that file). Shared contracts live in `docs/contracts/`; change them only via a message + both agents acknowledging.
5. **Edit only your own task rows and append-only to the message log** (newest at the bottom, prefix `[A HH:MM]` / `[B HH:MM]`). Never rewrite the other agent's lines; this keeps rebases conflict-free.
6. **Never commit:** datasets, LLM weights, `local.properties`, secrets, Modal tokens. Big artifacts go to a Modal Volume; the repo keeps only a download script + checksums. Exception: the small leaf classifier (`*.onnx` ≤ 15 MB) + its JSON and `knowledge.sqlite` (≤ 5 MB) go in `android/app/src/main/assets/models/` so the APK is reproducible.
7. **Do not commit the user's unrelated local changes** (e.g. the uncommitted `Makefile` edit) unless the user asks.
8. **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task board

| ID | Task | Owner | Status | Files / dirs | Updated (UTC) | Notes |
| :- | :--- | :---- | :----- | :----------- | :------------ | :---- |
| T00 | Audit handoff + SMS plan, write `docs/AUDIT.md` + `docs/contracts/README.md` v0, propose scope + split | A | review | `docs/AUDIT.md`, `docs/contracts/` | 23:58 | **B: read both, ack/amend contracts v0 in the log** |
| **P0** | | | | | | |
| T01 | Android SMS hub: Java FGS + SmsReceiver + allowlist + rate limit + SQLite log + multipart send; hub on/off from UI; BOOT restart | — | todo | `android/.../hub/`, manifest | — | proposed owner A. Audit S3–S6, S9 |
| T02 | Resolver + status strings EN/SW + keyword NLU (reads `lexicon`) + SMS formatter (safety line first, ≤2 segments, GSM-7 check) | — | todo | `android/.../brain/`, `res/values*/` | — | proposed owner A. Works with stub classifier until T10 lands |
| T03 | ONNX Runtime runner (reads `leaf_classifier.json`) + quality gate + JS bridge | — | todo | `android/.../brain/`, `FrontendActivity.java`, `app/build.gradle` | — | proposed owner A |
| T04 | UI redesign for Noor (3 tiles, SW-first, traffic-light cards, read aloud, Ask-a-person, hub screen) | — | todo | `frontend/` | — | proposed owner A. Audit §4 |
| T10 | Modal setup + coffee leaf classifier (BRACOL train, JMuBEN dedup test, temp scaling, thresholds, ONNX + JSON per contract §1) | — | todo | `ml/` | — | proposed owner B. **Needs user: `modal token new`** |
| T11 | `knowledge.sqlite` builder: sources, coffee advice EN+SW (CABI PlantwisePlus / Access Agriculture, cited), Uganda prices (WFP maize/beans, UCDA/MAAIF coffee) w/ source+date, SW/EN lexicon | — | todo | `ml/build_knowledge.py`, `data/` | — | proposed owner B. Contract §3 |
| T12 | Eval report + datasets/licences/size/"what it doesn't cover" doc | — | todo | `ml/reports/`, `docs/DATA.md` | — | proposed owner B. Scored item |
| **P1** | | | | | | |
| T13 | Add maize + bean + `other` classes to the same flat model | — | todo | `ml/` | — | B |
| T14 | NLU model (intent/crop/symptom) SW+EN, synthetic data labelled synthetic, trained on Modal | — | todo | `ml/` | — | B. Contract §4 |
| T20 | Demo script + video assets (emulator `adb emu sms send` backup) | — | todo | `docs/DEMO.md` | — | A + B |
| **P2** | | | | | | |
| T30 | Qwen3.5-0.8B Q4 via llama.cpp JNI (needs NDK) + GBNF, NLU only; optional LoRA on Modal | — | todo | `android/app/src/main/cpp/`, `ml/` | — | only after P0 is done |

## Decisions (proposed → agreed)

Defaults from `docs/AUDIT.md` §8, in force unless the user or the other agent objects in the log:

- D1 **No LLM in the core.** Core = flat leaf classifier (ONNX) + resolver + cited templates + SQLite. LLM = P2, NLU-only. *(proposed by A)*
- D2 If an LLM is used: **Qwen3.5-0.8B** (multilingual), not MiniCPM5-1B (EN/ZH only, 688 MB). *(proposed by A)*
- D3 Stand-in: **Uganda / UGX**; local language: **Swahili text**; Luganda = "less-supported" example. *(proposed by A)*
- D4 Android code stays **Java**, package `org.pandastic.relay`; no Kotlin/Room. *(proposed by A)*
- D5 Keep the **React UI in WebView**; models run natively; JS bridge. *(proposed by A)*
- D6 Confidence only from calibrated classifiers; text-only symptoms never CONFIDENT; no invented prices. *(proposed by A)*
- D7 Training on **Modal** (user requirement). *(user)*

## Message log (append-only)

- [A] Ledger created. Audit in progress; will push `docs/AUDIT.md` shortly with a proposed task split. Please pull and read it before starting implementation.
- [A 23:58] Audit pushed: `docs/AUDIT.md` (verdict in §0) + `docs/contracts/README.md` v0. Proposed split: **A = T01–T04 (Android + UI), B = T10–T12 (Modal training + knowledge DB + eval/data doc)**. Nothing is claimed yet except T00. B, please (1) ack or amend the split + contracts v0 here, (2) claim your rows. I will claim T01–T04 after your ack, or in ~15 min if there is no reply. Heads-up: Modal needs the user to run `modal token new` on your machine.
