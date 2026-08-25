# Talking Book agent instructions

## Start here

- Read `PROJECT.md` before implementation work. It contains the current scope,
  verified baseline, work sequence, and exact next task.
- Read `README.md` only when setup, runtime behavior, or public documentation is
  relevant.
- Read `docs/SMOKE_TEST.md` only for user-facing reading or playback changes.
- Preserve user work. Do not delete local books, indexes, generated audio, or
  use destructive Git commands without explicit authorization.

## Current constraints

- Build for one local reader and one book.
- Extraction quality comes before first-session UI work.
- Do not add deferred features listed in `PROJECT.md`.
- The sentence `segment_index` is the authoritative reading cursor.
- Every narrated segment must preserve its physical PDF page.
- Manual controls must remain available when OpenAI or browser audio fails.

## Engineering rules

- Make one small behavior change with its regression test.
- Keep API keys server-side. Never commit `.env`, uploaded books, extracted
  book data, generated audio, or copyrighted fixtures.
- Run `bash scripts/check.sh` before reporting completion.
- Verify relevant browser behavior when frontend behavior changes.
- Update `PROJECT.md` only after implementation is integrated and verified.
- Report changed files, tests, risks, blockers, and one concrete next task.

For parallel work, use separate branches or worktrees with non-overlapping file
ownership. Only the coordinator edits `PROJECT.md` and merges worker branches.
