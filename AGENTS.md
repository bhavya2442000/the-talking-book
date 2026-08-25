# Talking Book agent instructions

## Before changing the project

- Read only the project documents relevant to the task; do not load every
  document by default. Use this routing:
  - `STATUS.md` first for the current phase, verified baseline, blockers, and
    exact next task.
  - `README.md` for setup, current behavior, and user-facing operations.
  - `VISION.md` for product or reader-experience decisions.
  - `IMPLEMENTATION_PLAN.md` for roadmap scope, dependencies, and acceptance
    criteria.
- Use `TASKS.md` for task ownership and file scopes when work is parallelized.
- When implementing roadmap work, identify the applicable phase in
  `IMPLEMENTATION_PLAN.md` and preserve its dependencies and acceptance
  criteria.
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

## Task handoffs and parallel work

- At completion, report the result, changed files, verification, blockers, and
  one exact next task using `docs/TASK_HANDOFF_TEMPLATE.md`.
- The coordinator alone updates `STATUS.md` and `TASKS.md` after integration
  and verification. A worker reports a handoff instead of changing shared
  status files unless explicitly assigned to coordinate.
- Parallel workers must use separate branches or worktrees and non-overlapping
  write scopes. Shared contracts are agreed before implementation begins.
- Root status, task-board, roadmap, and shared configuration files are
  coordinator-owned integration files.
- Merge worker branches one at a time and run `bash scripts/check.sh` after
  each merge.

`AGENTS.md` is intentionally short and stable. Human-facing explanations,
product context, and the detailed roadmap belong in the linked documents rather
than being repeated here.

## Useful commands

```bash
source .venv/bin/activate
bash scripts/check.sh
uvicorn app.main:app --reload
```

The quality gate is intentionally small at this stage. Add stricter linting,
coverage, and browser acceptance checks only when their configuration and
fixtures are committed and reproducible.
