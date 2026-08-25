# Talking Book task board

This is the coordination board for parallel work. The coordinator owns task
assignment, status changes, and integration. Worker agents should not edit the
board or `STATUS.md` unless explicitly assigned to do so.

## Status meanings

- **Ready:** defined and available to assign
- **In progress:** assigned to one worker and isolated to its worktree
- **Review:** implementation complete; coordinator is reviewing it
- **Blocked:** cannot proceed without a dependency or decision
- **Done:** merged, verified, and reflected in `STATUS.md`

## Active board

| ID | Status | Task | Owner | Allowed write scope | Depends on |
| --- | --- | --- | --- | --- | --- |
| TB-EXTRACT-1 | Ready | Build extraction QA fixtures and classify reading order | Coordinator | `app/parser.py`, parser tests, permitted fixtures, plan/status updates | Phase 0 baseline |

## Queue after the next task

These are pointers, not active assignments. Move one into the active board only
after its dependencies and file scope are confirmed.

| ID | Task | Depends on |
| --- | --- | --- |
| TB-EXTRACT-2 | Resolve remaining page fragments, captions, and cross-page paragraph cases | TB-EXTRACT-1 |
| TB-FIRST-1 | Implement the one-book opening experience | TB-EXTRACT-2 |
| TB-P1.1 | Add versioned reader storage | TB-FIRST-1 |
| TB-P1.2 | Add the personal reader profile | TB-P1.1 |
| TB-P1.3 | Add per-book reader state | TB-P1.1 |
| TB-P1.4 | Add empty highlights, notes, and discussion collections | TB-P1.1 |

## Parallel-work rules

1. Agree on shared data contracts before splitting work.
2. Give each worker a unique task ID, branch, and worktree.
3. Never assign overlapping write scopes.
4. Treat root status, task-board, roadmap, and shared configuration files as
   coordinator-owned integration files.
5. Merge one worker branch at a time and run the full quality gate after each
   merge.
