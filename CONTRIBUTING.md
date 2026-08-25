# Contributing to Talking Book

Talking Book uses a lightweight GitHub Flow. The `main` branch is the stable,
integrated project state. All planned changes are developed on short-lived
branches and merged through pull requests after the quality check passes.

## Start a task

1. Read `PROJECT.md` for the current scope and exact next task.
2. Confirm that no other worker owns the same files.
3. Begin from the latest `main`:

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c codex/short-task-description
   ```

Human-authored branches may use `feat/`, `fix/`, or `docs/`. Codex branches use
the required `codex/` prefix. Keep one task and one coherent outcome per branch.

When work happens in parallel, use separate worktrees and non-overlapping file
scopes. Do not share an uncommitted working tree between tasks.

## Make and verify changes

- Make small, logical commits with imperative messages.
- Never commit `.env`, uploaded books, extracted text, generated audio, or
  copyrighted source files.
- Add tests for behavior changes.
- Run the complete local quality gate before pushing:

  ```bash
  source .venv/bin/activate
  bash scripts/check.sh
  ```

- Complete the relevant items in `docs/SMOKE_TEST.md` when user-facing browser
  behavior changes.

## Open a pull request

Push the branch and open a draft pull request early when feedback or
coordination would help:

```bash
git push -u origin HEAD
gh pr create --draft --fill
```

Before marking it ready:

1. Rebase or update the branch from current `main` when it has diverged.
2. Run `bash scripts/check.sh` again.
3. Complete the pull request template with verification and risk notes.
4. Review the complete diff for unrelated files and sensitive data.
5. Require the GitHub `quality` check to pass.

## Merge and clean up

Use **Squash and merge** so each pull request becomes one understandable commit
on `main`. GitHub deletes the remote branch automatically after merge.

Refresh the local repository before starting the next task:

```bash
git switch main
git pull --ff-only origin main
git branch -d codex/short-task-description
```

Do not force-push or commit directly to `main`. Do not rewrite already merged
history. If a merged change must be undone, use a new pull request that reverts
or corrects it.

## Task handoff

Report the result, changed files, verification, risks, blockers, and one exact
next task. The coordinator updates `PROJECT.md` only after integration and
verification.
