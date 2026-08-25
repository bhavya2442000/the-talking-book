# Talking Book — current project focus

This is the single source of truth for implementation work. Keep it short and
current. `README.md` explains how to run the app; `docs/SMOKE_TEST.md` contains
the manual regression checklist.

## Product slice

Build for one local reader and one book.

The immediate product must do two things well:

1. Extract a trustworthy narration sequence from a text-based PDF.
2. Give the reader a clean first session that introduces the book, offers the
   preface, and starts the main text correctly.

Do not add multiple users, multi-book conversation, microphone commands,
durable notes, images, web research, accounts, synchronization, deployment, or
other later features during this slice.

## Current verified baseline

- PDF upload, validation, extraction, indexing, and duplicate detection work.
- Pages, outline sections, paragraphs, and sentence segments are indexed.
- The sentence `segment_index` is the authoritative reading cursor.
- Browser and optional OpenAI narration work.
- Play, pause, continue, previous, next, repeat paragraph, and speed controls
  work.
- Browser position and narration preferences persist in `localStorage`.
- Passage-grounded explanations work.
- The Phase 0 baseline is commit `d5b0df9`.
- Last verified on 2026-08-25: 14 Python tests and 5 JavaScript tests pass.

## Known extraction risks

- Page-number fragments can appear in narration.
- Running headers and repeated material may be treated as prose.
- Captions and other non-prose blocks can enter the reading sequence.
- Paragraphs split across physical pages are not reliably joined.
- Table-of-contents material is not explicitly excluded from narration.
- Preface, foreword, introduction, and first main-text positions are not
  explicitly classified.

For a product that reads verbatim and cites physical pages, these are release
blockers rather than cosmetic imperfections.

## Work sequence

### 1. Extraction fixtures and reading classification

Create a small permitted or sanitized fixture set containing difficult cases:

- table-of-contents entries;
- page numbers and running headers;
- captions or other non-prose blocks;
- a preface, foreword, or introduction;
- a paragraph continuing across a page boundary; and
- the transition into the first chapter.

Record the expected block type, narration eligibility, sentence boundaries,
reading order, and physical page for each fixture. Do not commit the complete
copyrighted source book.

Complete when golden regression tests demonstrate that:

- table-of-contents material is navigation-only;
- preface and main text have explicit starting positions;
- page fragments and repeated headers are excluded;
- captions remain page-linked but are not ordinary narration;
- cross-page paragraphs remain logically continuous; and
- every narrated segment retains the correct physical page.

### 2. Repair extraction failures

Use the fixtures to fix the parser one failure class at a time. Every fix must
have a regression test. Preserve the existing JSON index contract unless a
versioned change is necessary.

Complete when the golden fixtures, existing automated tests, and relevant
manual checks all pass.

### 3. One-book first-session experience

With one indexed book:

1. Select it automatically.
2. Introduce the extracted title and author.
3. Never narrate the table of contents, title-page details, copyright pages, or
   other navigation-only material.
4. If a preface or foreword exists, ask whether to read it.
5. If it is skipped, begin at the first eligible main-text sentence.
6. Keep the visible chapter, sentence, and physical PDF page correct.
7. Keep the flow usable through manual controls without a microphone or API
   key.

External web context is not required for this milestone. If it is added later,
it must be clearly separated from the book's words and metadata.

Complete when a first-time reader can upload the one book, understand what it
is, choose preface or main text, and hear the correct first passage without
encountering navigation or extraction debris.

## Exact next task

**EXTRACT-1: Build the golden extraction fixture set and add reading-eligibility
expectations.**

Do not begin the first-session UI until the extraction fixtures expose a stable
preface start and main-text start.

## Verification

Run:

```bash
source .venv/bin/activate
bash scripts/check.sh
```

For user-facing reading changes, also complete the relevant sections of
`docs/SMOKE_TEST.md`.

## Updating this file

After a verified task, update only:

- the verified baseline if behavior or test counts changed;
- resolved or newly discovered extraction risks;
- the exact next task; and
- blockers, if any.

When multiple workers are used, only the coordinator updates this file. Workers
report changed files, tests, risks, and a concrete next step in their handoff.
