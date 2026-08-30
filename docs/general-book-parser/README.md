# General Book Parser implementation plan

This directory is the durable guide for replacing the current book-specific
PDF heuristics with a page-aware parsing and repair system that can handle a
wide range of books. Work for this initiative belongs on the
`codex/general-book-parser` branch until the definition of done below is met.

Read the repository root `AGENTS.md` and `PROJECT.md` before using this plan.
When they conflict, explicit user instructions and `AGENTS.md` win.

## Objective

Given one uploaded book, produce a trustworthy narration sequence that:

- works for born-digital and scanned PDFs within the supported quality range;
- identifies front matter, optional preliminary sections, main chapters, and
  back matter without assuming one publisher's structure;
- excludes navigation debris and non-prose from ordinary narration;
- reconstructs logical paragraphs and sentences without losing their physical
  PDF provenance;
- reports uncertainty instead of silently making destructive guesses; and
- remains correctable through a simple per-book repair workflow.

Sapiens is one evaluation book, not the source of parser rules. A rule is not
general merely because it fixes Sapiens.

"Any book" means broad, measured support with explicit fallbacks. It cannot
mean perfect automatic recovery from every malformed, encrypted, handwritten,
or arbitrarily encoded PDF.

## Current implementation status

GBP-1 through GBP-3 and the model-guided opening-map increment are complete on
`codex/general-book-parser`:

- the adapter-result and benchmark-result envelopes are versioned;
- five redistributable synthetic fixtures generate real PDFs at benchmark
  time and exercise the production parser end to end;
- the original sanitized golden fixture is registered alongside foreword /
  prologue and unbookmarked cross-page variants;
- a two-column textbook case proves the evaluator detects row-interleaving when
  visual reading order should finish the left column before the right;
- a true raster-only page verifies that missing OCR is reported as
  `unsupported` with `ocr_required`, rather than as an empty successful book;
- the frozen current-parser baseline records 139 passing checks and 44 visible
  gaps across 183 checks; and
- known gaps remain benchmark results rather than causing the quality gate to
  fail or weakening fixture expectations; and
- outline-free uploads can use a 15-page model scout with one bounded expansion
  to 30 pages, while exact page-text evidence is required before any proposed
  opening cursor changes the reader index.

The interrupted Docling spike remains benchmark-only. It is not the product
architecture and does not handle production uploads. Resume its full benchmark
only when OCR or complex physical layout blocks a supported novel or general
nonfiction book; use the lighter extractor plus semantic book mapper otherwise.

Run the detailed machine-readable benchmark with:

```bash
source .venv/bin/activate
python scripts/benchmark_parser.py
```

## Product boundaries

Keep the current product slice: one local reader and one active book. Do not
add accounts, synchronization, deployment, notes, web research, wake words, or
spoken playback commands as part of this work.

The parser must never rewrite a book's prose with an LLM. Models may classify
or order source blocks, but narration text must remain traceable to extracted
source spans. Manual reading and playback controls must remain available when
OCR, layout models, OpenAI, or browser audio fail.

## Design principles

1. **Provenance first.** Preserve page, bounding box, source character span,
   extraction method, and confidence before constructing reading units.
2. **Separate observation from interpretation.** The extraction layer reports
   blocks; the book planner decides what role they play.
3. **Use whole-document evidence.** Repetition, typography, bookmarks, page
   position, numbering, and neighboring blocks are stronger together than a
   single regex.
4. **Confidence controls automation.** High-confidence decisions apply
   automatically; uncertain decisions enter review.
5. **Corrections are per book first.** Do not turn one user's repair into a
   global rule until diverse fixtures prove it.
6. **One behavior per increment.** Every behavior change gets a focused golden
   regression case and preserves the existing reader whenever possible.
7. **Benchmark before adopting infrastructure.** Evaluate candidate engines on
   the same fixtures before changing the production extraction path.

## Target architecture

```text
PDF
 |
 v
Input profiler --------> native text / mixed / scanned / unsupported
 |
 v
Extraction adapter ----> text cells, styles, images, page geometry, OCR data
 |
 v
Canonical source model -> page-linked blocks with type candidates + confidence
 |
 v
Book planner ----------> sections, reading order, optional starts, exclusions
 |
 v
Continuity builder ----> logical paragraphs and sentences with source spans
 |
 v
Validator --------------> anomalies, confidence report, review requests
 |
 v
Reader index + repair record
```

The extraction engine is replaceable. The planner, validator, reader contract,
and tests must not depend directly on one vendor's object model.

## Canonical data contract

Define and version this contract before integrating another engine. Exact field
names may change during Phase 1, but these concepts are required.

### Source block

- stable block identifier;
- original text;
- physical page and bounding box;
- source character spans or OCR token references;
- typography and layout features when available;
- extraction method: embedded text, partial OCR, or full-page OCR;
- candidate block type and confidence;
- candidate reading-order position; and
- relationships to nearby pictures, captions, footnotes, or containers.

### Logical paragraph

- ordered references to one or more source fragments;
- block role such as prose, heading, caption, footnote, contents, header, or
  footer;
- narration eligibility and confidence;
- section membership; and
- cross-page status without discarding either page's provenance.

### Narrated segment

- authoritative `segment_index`;
- verbatim sentence text;
- one or more source spans, each with a physical page and bounding box;
- logical paragraph and section membership; and
- narration eligibility.

For compatibility, a primary `page` may remain available to the current UI,
but `source_spans` is authoritative when a sentence crosses pages.

### Book reading plan

- title and author with source and confidence;
- ordered sections with semantic roles;
- first eligible, preface/foreword, introduction/prologue, and main-text
  cursors when present;
- exclusions and their reasons;
- anomaly and confidence summary; and
- applied manual repairs.

## Evaluation corpus

Use only public-domain, openly licensed, generated, or sanitized material in
Git. Store the minimum pages needed for each behavior; never commit complete
copyrighted books.

The corpus must cover at least:

1. a conventional born-digital novel with bookmarks;
2. a novel without bookmarks;
3. Roman-numbered front matter followed by Arabic-numbered main text;
4. preface, foreword, introduction, and prologue variants;
5. contents pages with dot leaders and printed page numbers;
6. running headers, footers, and page numbers;
7. illustrations with single- and multi-line captions;
8. paragraphs and sentences crossing physical pages;
9. multi-column prose or textbook material;
10. footnotes or endnotes;
11. a clean scanned book requiring OCR;
12. a degraded scan that must produce warnings rather than false confidence;
13. a book with no explicit "Chapter 1" label; and
14. the sanitized Sapiens opening cases already observed locally.

Each fixture records expected source blocks, block types, reading order,
section roles, start cursors, sentence boundaries, narration eligibility,
physical pages, and expected uncertainties.

## Candidate extraction engines

Benchmark candidates through a small adapter spike. Do not place candidate
types directly in the reader or planner.

### Current pdfplumber/pypdf path

Keep it as the baseline. It is lightweight and preserves useful coordinates,
but reading order, OCR, and semantic layout currently require substantial
custom work.

### Docling

Evaluate first. It offers OCR, learned layout labels, reading-order processing,
heading inference, and provenance. Its MIT license and structured document
model make it the leading candidate, but it still has reading-order edge cases
and must earn adoption through the corpus.

### Marker

Evaluate only if Docling leaves important gaps. It exposes useful block types
and optional OCR/LLM repair, but its GPL license and heavier model stack require
an explicit licensing and operational decision before integration.

### Selection gate

Choose a production foundation only after recording, for every fixture:

- verbatim text accuracy;
- block-type precision and recall for narration-affecting roles;
- reading-order accuracy;
- section and start-position accuracy;
- page/bounding-box provenance accuracy;
- OCR coverage and confidence behavior;
- runtime, memory, model-download size, and CPU/Apple Silicon behavior;
- license and local-data implications; and
- failure behavior when dependencies or models are unavailable.

No single aggregate score may hide a release-blocking provenance or ordering
failure.

## Implementation phases

### Phase 0 — Protect and measure the baseline

Deliverables:

- freeze the existing JSON output as compatibility fixtures;
- create the evaluation manifest and licensing notes;
- add sanitized cases until the minimum corpus categories are represented;
- define evaluation metrics and a machine-readable result format; and
- record the current parser's results without changing its behavior.

Gate: the same command can evaluate any parser adapter against the corpus and
produce comparable failures.

### Phase 1 — Canonical source model and adapter boundary

Deliverables:

- introduce versioned source-block, source-span, and confidence schemas;
- adapt the current parser to emit the canonical model;
- keep the current public reader index available through a compatibility
  transformation; and
- add contract and round-trip tests.

Gate: the UI and API still work, and no physical-page information is lost.

### Phase 2 — Extraction engine benchmark

Deliverables:

- implement a non-production Docling adapter spike;
- profile native-text, scanned, and mixed PDFs;
- compare it with the baseline on every fixture;
- document model downloads, licenses, resource use, and failure modes; and
- make an explicit adopt, hybridize, or reject decision.

Gate: a written decision identifies the chosen foundation and evidence. Do not
switch production extraction merely because a demo looks better.

### Phase 3 — General block classification and reading order

Implement one tested failure class at a time:

- page numbers and repeated headers/footers using cross-page repetition;
- contents and navigation blocks;
- headings and multi-column reading order;
- captions using layout type, typography, and picture relationships;
- footnotes/endnotes; and
- prose fallback when classification is uncertain.

Gate: narration-affecting block classifications meet the corpus thresholds and
uncertain blocks remain visible for review.

### Phase 4 — Book structure and starting policy

Combine bookmarks, detected headings, numbering, typography, contents entries,
and semantic title classification to build the section hierarchy.

Starting policy:

1. introduce title and author;
2. exclude navigation-only/front-matter debris;
3. offer a detected preface or foreword;
4. treat introduction or prologue according to its detected role and expose it
   as an explicit choice when appropriate;
5. otherwise begin at the first eligible main section; and
6. request review when competing start points are close in confidence.

Gate: every structure fixture exposes the correct optional and main-text
cursors without relying on a publisher-specific title list alone.

### Phase 5 — Cross-page continuity and sentence provenance

Build logical paragraphs from source fragments using page position, typography,
indentation, punctuation, hyphenation, column geometry, and neighboring block
roles. Sentence segmentation happens after logical continuity is established.

A sentence crossing pages must reference both source spans. The visible page
can follow the currently spoken span without changing its `segment_index`.

Gate: cross-page fixture text is continuous, verbatim, correctly ordered, and
page-citable at every spoken span.

### Phase 6 — Validation and repair workflow

Automatically flag:

- low text coverage or likely OCR failure;
- conflicting reading orders;
- unusually short prose runs;
- captions or footnotes inside the proposed narration path;
- broken sentence starts at page boundaries;
- missing or competing main-text starts; and
- large unexplained gaps or duplicated text.

Provide a minimal local review flow that can:

- include or exclude a block from narration;
- change a block role;
- join or separate paragraph fragments;
- reorder ambiguous neighboring blocks;
- select preface and main-text starts; and
- rebuild the index while keeping an auditable per-book repair record.

Gate: a reader can correct an uncertain book without editing JSON or source
code. Repairs never silently become global parser rules.

### Phase 7 — Integration and hardening

Deliverables:

- migrate upload/indexing through the selected pipeline;
- version or migrate existing book indexes safely;
- retain manual controls and graceful fallback;
- test cancellation, progress, corrupt inputs, model absence, and re-indexing;
- complete the relevant browser smoke checklist; and
- update public setup and model-download documentation.

Gate: the full corpus, automated suite, and manual smoke tests pass on a clean
setup. Existing local books and indexes are preserved or explicitly migrated.

## Quality thresholds

Set exact numeric thresholds after the Phase 0 corpus exists. Until then, the
non-negotiable requirements are:

- no narrated text without physical source provenance;
- no silent text rewriting;
- no contents, repeated header/footer, or known caption in ordinary narration;
- correct optional and main-text starts for every release fixture;
- deterministic output for the same engine/model versions;
- an explicit warning instead of a confident but unusable index; and
- manual controls remain usable after any automated extraction failure.

## First implementation increment — complete

**GBP-1: Create the evaluator contract and evaluation manifest without
changing production parsing behavior.**

The increment should:

1. define a parser-adapter result envelope;
2. define fixture expectations for blocks, order, roles, starts, spans, and
   uncertainty;
3. register the existing sanitized fixture plus at least two additional
   permitted layout variants;
4. run the current parser through the evaluator; and
5. report failures as benchmark results rather than weakening expectations.

Do not install Docling or change upload behavior during GBP-1.

## Second implementation increment — complete

**GBP-2: Add one permitted two-column textbook fixture and prove that the
evaluator detects incorrect inter-column reading order without changing the
production parser.**

Record the resulting current-parser baseline movement. Keep the fixture fully
synthetic and preserve expected page and block provenance.

## Third implementation increment — complete

**GBP-3: Add one copyright-safe image-only scanned-page fixture and evaluator
coverage for missing text/OCR uncertainty without changing production
parsing.**

The current adapter must report the observed outcome without pretending OCR
occurred. Record the baseline movement and keep the generated scan local and
synthetic.

## Model-guided opening-map increment — complete

For an outline-free upload, inspect extracted text from at most the first 15
physical pages, expanding once to 30 pages. Accept preface, introduction, and
first-main-section markers only when each contains exact source evidence on its
claimed physical page. Cache the accepted map in the book index. Preserve the
existing reader index and record `review_required` when the model, extraction,
or evidence validation fails.

## First-session opening choice — complete

The first session recommends a verified preface or introduction and counts the
eligible opening sections that follow before the main chapter. It separately
offers a direct skip to the main chapter. A `review_required` map is described
as unverified and retains a manual first-passage start.

## Safe re-index increment — complete

**OPENING-3: Add a safe retry/re-index API action for an existing local book so
opening-map and classification improvements can be applied without deleting
the upload or losing the saved sentence cursor. Add the API regression before
adding UI.**

The action verifies the stored PDF digest, builds the replacement fully before
the atomic index save, and remaps the browser cursor by physical page and exact
sentence. If a previously saved sentence becomes non-readable, it selects and
reports the nearest eligible passage. A live Carnegie re-analysis removed stale
Cover and Copyright navigation entries and safely moved an obsolete saved
front-matter cursor to Chapter 1.

## Deferred parser-validation increment

**OPENING-4: Run one copyright-safe outline-free novel through the complete
production upload path, record the proposed optional opening and main-text
start, and add a regression for only the first general failure observed. Do not
add another UI control.**

This validation was deferred at the user's direction after the existing
opening flow and safe re-index action proved sufficient for the current product
work. `PROJECT.md` remains authoritative for the active next task.

## Agent working rules

- Confirm the active branch is `codex/general-book-parser` before editing.
- Read this entire file, `AGENTS.md`, and `PROJECT.md` before implementation.
- Keep production behavior unchanged through Phase 0 unless the task explicitly
  says otherwise.
- Do not add a rule named for a real book, publisher, author, or observed page.
- Add only permitted or sanitized fixture content to Git.
- Keep dependencies behind adapters and record licenses before adding them.
- Keep API keys server-side and never send local book contents to a remote
  model without explicit user authorization.
- Run `bash scripts/check.sh` before handoff.
- For frontend behavior, complete the relevant `docs/SMOKE_TEST.md` checks.
- Update `PROJECT.md` only after an increment is integrated and verified.

## Handoff template

Every implementation handoff must report:

```text
Branch:
Increment:
Outcome:
Changed files:
Fixtures added or changed:
Automated verification:
Manual verification:
Benchmark movement:
Known risks:
Blockers:
Concrete next task:
```

## Definition of done

This initiative is ready to merge only when:

- the supported input classes are documented;
- the diverse permitted corpus and evaluator are reproducible;
- an extraction foundation has been selected from recorded evidence;
- the canonical source model preserves page-level provenance;
- book structure, optional starts, and main-text starts pass the corpus;
- captions, navigation debris, headers, footers, and footnotes are handled with
  measured confidence;
- cross-page prose is logically continuous and physically citable;
- low-confidence books enter a usable repair workflow;
- the current manual reading experience remains available on failure;
- existing tests and relevant browser smoke checks pass; and
- `PROJECT.md`, setup documentation, and migration guidance reflect the final
  integrated behavior.
