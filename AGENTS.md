# Talking Book agent instructions

## Before changing the project

- Read `README.md`, `VISION.md`, and `IMPLEMENTATION_PLAN.md` before making
  implementation decisions.
- Treat the current roadmap phase as authoritative. Do not skip a phase's
  acceptance criteria to reach a later voice or research feature.
- Preserve existing user work. Never use destructive Git commands or delete
  uploaded books, indexes, or generated audio without explicit authorization.

## Current baseline

This is a local pre-alpha FastAPI application with a dependency-free browser
frontend. The sentence index is the authoritative reading cursor shared by
navigation, narration, progress persistence, and companion context.

The baseline must continue to support:

- PDF upload and page-aware extraction;
- one indexed book and chapter navigation;
- browser narration and optional OpenAI narration;
- pause, continue, previous, next, repeat paragraph, and speed controls;
- saved browser position and narration preferences; and
- grounded passage explanations.

Manual controls must remain available whenever microphone or network features
are unavailable. Future voice commands must call the same deterministic action
layer as buttons; models and tools must not manipulate DOM or audio state
directly.

## Engineering rules

- Make one small behavior change at a time and keep the app runnable.
- Every behavior change needs automated tests. Run `bash scripts/check.sh` from
  an activated virtual environment before reporting completion.
- Verify user-facing browser behavior when frontend behavior changes.
- Keep API keys server-side. Never commit `.env`, uploaded books, extracted
  text, generated audio, or other local runtime data.
- Update documentation or roadmap status only when the implementation and its
  verification actually exist.
- For OpenAI API behavior, consult the official OpenAI documentation and record
  the relevant contract in the implementation.
- Never claim a phase is complete with failing or skipped checks.

## Useful commands

```bash
source .venv/bin/activate
bash scripts/check.sh
uvicorn app.main:app --reload
```

The quality gate is intentionally small at this stage. Add stricter linting,
coverage, and browser acceptance checks only when their configuration and
fixtures are committed and reproducible.
