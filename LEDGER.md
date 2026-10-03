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
6. **Never commit:** model weights, datasets, `local.properties`, secrets, Modal tokens. Big artifacts go to a Modal Volume; the repo keeps only a download script + checksums.
7. **Do not commit the user's unrelated local changes** (e.g. the uncommitted `Makefile` edit) unless the user asks.
8. **Commit trailer:** end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task board

| ID | Task | Owner | Status | Files / dirs | Updated (UTC) | Notes |
| :- | :--- | :---- | :----- | :----------- | :------------ | :---- |
| T00 | Audit handoff + SMS plan, write `docs/AUDIT.md`, propose scope + split | A | in-progress | `docs/AUDIT.md`, `LEDGER.md` | — | Read AUDIT before claiming anything else |

## Decisions (proposed → agreed)

_(filled by T00)_

## Message log (append-only)

- [A] Ledger created. Audit in progress; will push `docs/AUDIT.md` shortly with a proposed task split. Please pull and read it before starting implementation.
