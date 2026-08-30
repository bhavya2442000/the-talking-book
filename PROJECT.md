# Talking Book — current project focus

This is the single source of truth for implementation work. Keep it short and
current. `README.md` explains how to run the app; `docs/SMOKE_TEST.md` contains
the manual regression checklist.

## Product slice

Build for one local reader and a small local library.

The immediate product must do three things well:

1. Extract a trustworthy narration sequence from a text-based PDF.
2. Give the reader a clean first session that chooses among available books,
   introduces the selected book, offers its preface, and starts the main text
   correctly.
3. Let the reader explicitly start and stop a low-latency voice conversation
   grounded at the exact stopped sentence, and save voice-requested notes,
   highlights, and sourced research there.

Do not add multiple users, wake-word activation, additional reader-control
capabilities, durable server memory, images, accounts, synchronization,
deployment, or other later features during this slice.

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
- Outline sections now include additive `reading_role` and
  `narration_eligible` metadata.
- Extracted books expose stable first-eligible, preface, introduction, and
  main-text segment cursors without changing physical segment indexes.
- Narration navigation now skips sections and segments marked as non-readable.
- The selected-book first-session flow introduces the extracted title and author,
  recommends a detected preface or introduction plus the worthwhile opening
  sections that follow it, and keeps a separate direct-to-main-chapter choice.
- Local testing can explicitly preview a new reader, which ignores saved state
  without deleting it, or a returning reader, which shows the saved section,
  physical page, section progress, optional grounded recap, and exact continue
  action.
- With multiple books and no started session, one Play press requests microphone
  access and begins a continuous spoken welcome. The model interprets the book
  and parser-derived opening choice through one validated tool, while the app
  alone loads the real book and authoritative start cursor. Visible title and
  opening choices remain fallbacks. Returning readers bypass this welcome and
  open their most recently used book.
- Existing books can be safely re-analyzed from their verified original PDF.
  The replacement index is saved only after extraction and opening mapping
  succeed, and saved reading positions are remapped by physical page and exact
  sentence or moved to the nearest eligible passage with an explicit notice.
- Natural narration stops at readable section boundaries, names the completed
  and upcoming sections, and saves the first sentence of the upcoming section
  before the reader chooses Continue or Pause here.
- The local Sapiens index has been rebuilt and now starts at Chapter 1 on PDF
  page 11 instead of reading its contents or other front matter.
- Smaller-font labeled illustration and map captions remain page-linked in the
  index but are excluded from ordinary narration.
- A general-parser benchmark now generates five copyright-safe PDFs and runs
  the production parser through 183 checks covering outline/front-matter roles,
  captions, repeated headers, prologue handling, unbookmarked structure,
  cross-page continuity, two-column reading order, raster-only OCR handling,
  start cursors, and source provenance. The frozen baseline records 139 passing
  checks and 44 explicit gaps.
- New outline-free uploads can use a bounded model scout over at most the first
  30 physical PDF pages. Proposed preface, introduction, and main-text starts
  are applied only when their quoted evidence exists on the claimed page;
  model failure preserves the existing reading order and records review status.
- One visible Ask by voice control starts an on-demand WebRTC conversation and
  stops narration at the authoritative sentence before requesting microphone
  access. The model receives that sentence, its paragraph, section, and physical
  PDF page, waits silently for the reader's first request, and is disconnected
  before narration resumes. Persistent listening is disabled for now.
- During an explicit live conversation, the model interprets natural language
  through one generic `control_reader` contract. Its currently supported plans
  continue from the exact sentence or repeat the current paragraph; the app
  validates the structured action and scope before touching the authoritative
  cursor. No new screen control was added.
- One validated `annotate_book` tool interprets voice requests for a note,
  sentence or paragraph highlight, or passage-related research. Annotations are
  stored locally per book with exact quote, authoritative sentence cursor, and
  physical PDF page anchors; saved anchors remap by quote and page on reload.
- Highlights render on their anchored text. Notes and externally sourced
  research render under the anchored paragraph. Research uses the Responses API
  web-search tool, stays distinct from book text, and preserves source links.
- A real-key browser smoke test passed on 2026-08-25: microphone permission,
  grounded page-11 conversation, interruption, mute/unmute, the 12-turn memory
  bound, explicit End, media release, and browser/server error checks all
  behaved as designed.
- A browser narration smoke test passed on 2026-08-25: Next skipped the full
  multi-line illustration caption on PDF page 14 and the map caption on PDF
  page 22, retained the correct page, and produced no console errors.
- An isolated first-session browser smoke test passed on 2026-08-25: the screen
  offered Start with Preface versus Skip to Chapter 1, and each action opened
  and narrated the correct physical PDF page.
- A live re-analysis smoke test passed on 2026-08-26: the 263-page Carnegie PDF
  remained intact, stale Cover and Copyright entries disappeared, and an old
  front-matter cursor moved safely to Chapter 1 on physical PDF page 25 before
  appearing correctly in Returning reader.
- A live chapter-transition smoke test passed on 2026-08-26: narration stopped
  after the one-line Part One section, selected Chapter 1 on physical PDF page
  25, persisted it for Returning reader, and started it only after Continue.
- A two-book browser smoke test passed on 2026-08-27: build 16 showed no
  preselected book, Play spoke the welcome, title selection spoke the opening
  choice, Skip began mapped main text on a physical page, and Returning reader
  bypassed the welcome for the saved book.
- A no-permission build-17 browser check passed on 2026-08-27: the Sapiens title
  omitted the download-site suffix, the typed companion panel was hidden, the
  visible book/opening fallbacks remained available, and the console had no
  errors.
- Build 18 makes the spoken opening question a speech-only response and then
  requires the reader's answer to produce the validated start action. This
  prevents the welcome model from replacing book narration with an explanation.
- A no-permission build-19 browser check passed on 2026-08-28: Ask by voice was
  visible and enabled in the playback bar, no persistent microphone control was
  present, and the console had no errors.
- Last verified on 2026-08-28: 37 Python tests and 27 JavaScript tests pass.

## Known extraction risks

- Unlabeled or nonstandard captions and other non-prose blocks inside chapters
  can still enter the reading sequence. Smaller-font captions with explicit
  figure, map, or numbered labels are now excluded from ordinary narration.
- Paragraphs split across physical pages are not reliably joined.
- Classification relies mainly on publisher outline titles and is not yet a
  general solution for every PDF layout.

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

### 3. Local-library first-session experience

With one or more indexed books:

1. Select one book automatically; with multiple books, ask a new reader to
   choose and open the latest started book for a returning reader.
2. Introduce the selected book's extracted title and author.
3. Never narrate the table of contents, title-page details, copyright pages, or
   other navigation-only material.
4. If a preface or foreword exists, ask whether to read it.
5. If it is skipped, begin at the first eligible main-text sentence.
6. Keep the visible chapter, sentence, and physical PDF page correct.
7. Keep the flow usable through manual controls without a microphone or API
   key.

External web context is not required for this milestone. If it is added later,
it must be clearly separated from the book's words and metadata.

Complete when a first-time reader can choose among available books, understand
the selected book, choose preface or main text, and hear the correct first
passage without encountering navigation or extraction debris.

## Exact next task

Follow `docs/general-book-parser/README.md` on the
`codex/general-book-parser` branch.

**VOICE-6: With a real key, begin narration, press Ask by voice, and confirm the
book stops at the visible sentence before microphone access. Ask one grounded
question, save a note and sentence highlight, then say Continue and verify the
voice session closes and narration resumes from that exact sentence. Repeat once
using the visible Continue reading button. Fix only reproduced failures.**

Sapiens remains an evaluation case, not the source of parser rules. Do not add
book-, publisher-, author-, or page-specific production heuristics. The
non-production Docling adapter remains an optional extraction experiment, not
the product architecture; resume that benchmark only when a supported book's
physical layout or OCR blocks the lighter path. Wake-word activation and
always-listening behavior remain outside this slice.

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
