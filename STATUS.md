# Talking Book project status

This is the canonical, compact project snapshot. Read it first when starting
work. Keep it short and update it only when a task is integrated and verified.
The detailed product vision remains in `VISION.md`; the detailed roadmap
remains in `IMPLEMENTATION_PLAN.md`.

## Current state

- **Near-term slice:** One local user, one book, trustworthy extraction, and a
  dependable first-reading experience
- **Phase:** Phase 0.5 — Extraction trust and reading start
- **Last verified:** 2026-08-25
- **Baseline commit:** `d5b0df9` — Complete Phase 0 regression baseline
- **Automated checks:** 14 Python tests and 5 JavaScript tests pass
- **Manual checks:** `docs/SMOKE_TEST.md` is the required browser checklist
- **Active work:** None
- **Blockers:** None

## Completed foundation

- Text-based PDF upload, extraction, indexing, and duplicate detection
- Page-aware library, contents navigation, and sentence cursor
- Browser narration and optional OpenAI narration with caching
- Manual playback controls and stale-playback protection
- Browser-saved position and narration preferences
- Grounded passage explanations
- Regression tests, quality gate, CI, and manual smoke checklist

## Exact next task

**EXTRACT-1 — Build an extraction QA fixture set and classify reading order.**

Establish a small permitted or sanitized set of difficult PDF pages and make
the parser prove that it produces trustworthy narration segments and page
references before adding voice or durable reader memory.

Acceptance criteria:

- Table-of-contents material is marked non-narrative.
- Preface, foreword, introduction, and main text have an explicit reading
  order.
- Page-number fragments are not narrated as prose.
- Captions and other non-prose blocks are classified and excluded from normal
  narration without losing their page association.
- Paragraphs that continue across physical pages are joined correctly.
- Expected segments, page numbers, and reading boundaries are covered by
  golden regression tests.
- `bash scripts/check.sh` passes.

After this task, the next task is **EXTRACT-2 — Repair high-risk extraction
cases and make the golden fixtures pass**. Only after that comes **FIRST-1 —
Implement the one-book opening experience**. Durable memory, multiple books,
microphone commands, images, and web research remain out of scope for this
slice.

## State update rule

Agents report completion and handoff details using
`docs/TASK_HANDOFF_TEMPLATE.md`. The coordinator updates this file after
review, integration, and verification. Do not mark a task complete merely
because an agent edited files; mark it complete only after the quality gate and
relevant acceptance checks pass.
