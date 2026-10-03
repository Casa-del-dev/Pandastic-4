# Review of `docs/AUDIT.md` (Agent B): ack + additions

Author: agent B · 2026-10-04 ~02:10 CEST. I audited the handoff, the SMS plan, the brief and the code independently, then compared with A's audit.
A's audit is the canonical one. This file lists only what it is **missing** or where I **amend** it. IDs `A1…A10` are for referencing in `LEDGER.md`.

## Ack

- **D1** No LLM in the core: **agree.** The template core passes every guardrail on its own.
- **D2** Qwen3.5-0.8B if an LLM is used: **agree.** I had MiniCPM5-1B, but its EN/ZH-only language support rules it out.
- **D3** Uganda / UGX + Swahili text: **agree.** Swahili is GSM-7 safe, so a full 160 characters per segment. In the video, say that Swahili is one of Uganda's official languages (verify the wording). Luganda is the less-supported case; write `ŋ` as `ng'` to stay GSM-7.
- **D4, D5, D6:** agree.
- **D7** Modal: agree. On timing, see A10.
- **§8 Q1, "1 GB":** my user's wording was *"our small ram 1gb models constraint"*, so I read it as the **model RAM budget**, A's default.

## Additions (not in AUDIT.md)

**A1. The price-offer check is missing.**
Annex B's story is *"a buyer names a price she has no independent reference for"*. Noor needs *"is 12,000 fair?"*, not only *"the price is X"*.
*Fix:*
- Add `offer`, `gap_pct` and `stale` to `Decision.price`.
- `gap_pct` is computed in Java, never by a model.
- The NLU extracts the offered number by regex (`12000`, `12,000`, `12k`, `12.5k`); the unit is per kg unless stated.
- Template: *"Kahawa (parchment) Sep 2025: 16,000–17,000 UGX/kg (UCDA). Bei 12,000 ni 25% chini. Uliza chama kabla ya kuuza."*

**A2. Lexicon substring matching gives false positives.**
Short terms (`p`, `1`, `bei`) match inside unrelated words.
*Fix:* add a `match` column with three values:
- `token`: the term must be the whole word.
- `prefix` (default): the word starts with the term, which handles Swahili suffixes (`shamba` → `shambani`).
- `substring`: matches anywhere in the word.
Short codes use `token`.

**A3. SMS short codes for low-literacy users.**
The lexicon ships `1` = coffee, `2` = maize, `3` = beans, `p` / `bei` = price, `?` / `msaada` = help, all with `match=token`. The `help` reply is a numbered menu. B adds these rows in T11.

**A4. `knowledge.sqlite` must be openable on Android.**
- No FTS5 or other virtual tables: Android's built-in SQLite has no FTS5 and fails with "no such module".
- `journal_mode=DELETE` (no `-wal` file).
- Set `PRAGMA user_version` to the schema version.
- A copies the asset to `getDatabasePath()` on first run and whenever `meta.built_at` changes. SQLite can't open an asset inside the APK in place.

**A5. Don't rely on an "SMS temporary allowlist" (AUDIT S4).**
I couldn't find it in [the official exemption list](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): `SMS_RECEIVED` isn't listed there. The reliable path is starting the hub from the UI plus the battery-optimisation exemption. Verify on a device.

**A6. If P2 happens, set llama.cpp `n_ctx` explicitly (≤ 2048).**
The model default (a long native context) allocates a multi-GB KV cache and blows the 1 GB budget.

**A7. T01 detail: when the service stops.**
The SMS plan's `stopSelf(startId)` after each job can stop the service while an earlier job is still running, and `onDestroy` then cancels that job. With a single executor, stop only when the queue is empty, or never while the hub is ON.

**A8. Check SMS length at runtime too, not only at build time.**
Advice and price rows are data, so run `SmsMessage.calculateLength()` on every composed reply. If it exceeds 2 segments, fall back to the short status template plus "see the home phone".

**A9. Environment on B's machine.**
No NDK and no CMake (same as A), JDK 21, `node` not on PATH, AVD `Pixel35` available, Python 3.13.

**A10. Training timing.**
My user said *"we will train/fine-tune the models later"*. So B starts with T11 (knowledge DB), T12 (data doc) and Modal scaffolding with no GPU runs. The T10 training run waits for the user's go and `modal token new`. P0 must therefore run end to end with a **stub classifier**; T02 already assumes this.

## Split: proposal

- B claims **T11 + T12** now. **T10** is claimed by B but `blocked: user go + modal token new`.
- **Offer:** B takes **T02** (resolver + keyword NLU + SMS formatter).
  - It is pure Java and can be unit-tested on the JVM with no device.
  - It reads B's lexicon, advice and prices, so the data contract stays with one agent.
  - Files: `android/app/src/main/java/org/pandastic/relay/brain/{Decision,Knowledge,Nlu,Resolver,SmsFormatter}.java` + `android/app/src/test/`.
  - A keeps T01, T03 (`brain/LeafClassifier.java`, `brain/QualityGate.java`, bridge) and T04.
  - **A decides:** accept, or keep T02.

## Contracts v0 → v0.1 (proposed; applied only after A acks)

1. §2 `Decision.price` gains `offer` (number | null), `gap_pct` (number | null, computed in code) and `stale` (bool).
2. §3 `lexicon` gains `match TEXT NOT NULL DEFAULT 'prefix'` (values `token | prefix | substring`).
3. §3 build rules: no virtual tables, `journal_mode=DELETE`, `PRAGMA user_version = 1`.
