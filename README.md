# Talking Book

Talking Book turns a PDF into a page-aware audiobook with an AI reading
companion. It extracts a stable narration sequence, starts at a sensible book
opening, preserves physical PDF pages, remembers the reader's position, and
supports deliberate voice conversations about the stopped passage.

The project is a local pre-alpha for one reader and a small library. It is not
ready to expose directly to the public internet: there is no authentication,
rate limiting, production storage, or multi-user isolation.

## What works

- Upload and index text-based PDFs up to 50 MiB.
- Preserve sections, paragraphs, sentence segments, and physical PDF pages.
- Exclude recognized contents, front-matter debris, and labeled captions from
  ordinary narration.
- Use a bounded, source-validated model pass to find the opening of an
  outline-free book without rewriting its prose.
- Offer a detected preface or introduction separately from the main text.
- Narrate through browser speech or optional OpenAI-generated audio.
- Navigate by section, sentence, paragraph, and readable section boundary.
- Restore the latest saved sentence, speed, and narration preference.
- Pause at the exact sentence for an on-demand voice question.
- Continue or repeat through validated model tool calls.
- Save page-anchored notes, highlights, and sourced research locally.
- Re-analyze a stored PDF and safely remap the saved cursor.

The sentence `segment_index` is the authoritative reading cursor. Every
narrated segment retains its physical PDF page, and manual controls remain
available when OpenAI or browser audio is unavailable.

## Reader flow

1. Open the local app.
2. Choose an available book, or upload a permitted PDF.
3. For a new book, choose the recommended opening or the mapped main text.
4. Press Play to narrate from the selected sentence.
5. Press **Ask by voice** to stop at that sentence and start the microphone.
6. Ask a grounded question or request a note, highlight, or research item.
7. Say **Continue**, say **Repeat**, or use the visible playback control.

The microphone is active only during an explicit voice session. It is closed
before book narration resumes, preventing the companion and narrator from
intentionally sharing the output channel.

## Architecture

```text
PDF
 └─> FastAPI upload API
      └─> page-aware extraction and opening mapper
           └─> atomic JSON book index
                ├─> browser reader and localStorage cursor
                ├─> browser or OpenAI narration
                ├─> grounded Responses API questions and research
                └─> on-demand Realtime WebRTC conversation
```

- `app/parser.py` extracts positioned text, infers reading units, classifies
  narration eligibility, and preserves page provenance.
- `app/book_mapper.py` proposes optional and main-text starts for outline-free
  books. A proposal is accepted only when its quoted evidence exists on the
  claimed page.
- `app/main.py` owns the HTTP API and all OpenAI credentials and calls.
- `app/store.py` writes one atomic JSON index per local book.
- `static/app.js` coordinates reader state, playback, voice, and annotations.
- Pure frontend decisions live in small `.mjs` modules with Node tests.

The current parser uses `pypdf`, `pdfplumber`, and `pysbd`. A Docling adapter
exists only as a benchmark experiment; it is not part of production uploads.

## Supported inputs and known gaps

Best supported today:

- born-digital English PDFs;
- publisher outlines or conventional headings;
- novels and general nonfiction with mostly single-column prose.

Known limitations:

- scanned-image pages require OCR and are reported as unsupported by the
  current production parser;
- paragraphs split across pages are not always joined;
- multi-column layouts, footnotes, marginalia, and unusual captions can be
  ordered or classified incorrectly;
- outline-free books receive a validated opening map, but later chapter
  boundaries may remain incomplete;
- EPUB and other ebook formats are not supported;
- notes and reading state are local to one browser;
- wake words and persistent listening are intentionally disabled.

When extraction confidence is insufficient, the system keeps the fallback
reading order and marks the opening for review instead of silently inventing
structure.

## Local setup

Requirements:

- Python 3.11 or newer;
- a modern browser;
- Node.js for frontend tests;
- an OpenAI API key only for optional model-backed features.

```bash
git clone https://github.com/bhavya2442000/the-talking-book.git
cd the-talking-book
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>.

For development dependencies:

```bash
python -m pip install -r requirements-dev.txt
```

For the optional extraction benchmark dependencies:

```bash
python -m pip install -r requirements-benchmark.txt
```

## Configuration

The ignored `.env` file supports:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_TEXT_MODEL=gpt-5.6-luna
OPENAI_TTS_MODEL=tts-1
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=marin
```

The key stays on the Python server and is never returned by `/api/config`.
Without a key, PDF extraction, navigation, saved progress, and browser
narration continue to work.

Model-backed features may send:

- up to the first 30 extracted physical pages when mapping an outline-free
  opening;
- a small nearby passage when answering or researching a question;
- one sentence at a time for OpenAI narration; and
- microphone audio only during an explicit Realtime session.

These operations can incur OpenAI API usage.

## Commands

Run the complete quality gate:

```bash
source .venv/bin/activate
bash scripts/check.sh
```

Run the parser benchmark:

```bash
source .venv/bin/activate
python scripts/benchmark_parser.py
```

Build an index directly:

```bash
source .venv/bin/activate
python scripts/extract_book.py /path/to/book.pdf --output data/books/book.json
```

Current automated baseline:

```text
Python tests:     36 passing
JavaScript tests: 26 passing
```

The synthetic parser benchmark evaluates 183 expectations. The frozen current
parser baseline passes 139 and exposes 44 known gaps without weakening the
quality gate.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health and indexed-book count |
| `GET` | `/api/config` | Feature availability and model names |
| `GET` | `/api/books` | Library summaries |
| `GET` | `/api/books/{book_id}` | Complete book index |
| `POST` | `/api/books` | Upload and index a PDF |
| `POST` | `/api/books/{book_id}/reindex` | Safely rebuild an existing index |
| `POST` | `/api/books/{book_id}/explain` | Grounded passage answer |
| `POST` | `/api/books/{book_id}/research` | Sourced passage research |
| `POST` | `/api/books/{book_id}/speech` | Generate or retrieve sentence audio |
| `POST` | `/api/books/{book_id}/realtime` | Start a passage-grounded voice session |
| `POST` | `/api/realtime/library` | Start the spoken first-session guide |

Interactive API documentation is available at <http://127.0.0.1:8000/docs>
while the server is running.

## Repository layout

```text
app/                       FastAPI backend, parser, mapper, and storage
benchmarks/                Synthetic general-book evaluation framework
scripts/                   Quality gate, benchmark, and extraction commands
static/                    Dependency-free browser application
tests/                     Python, JavaScript, and synthetic fixture tests
README.md                  Project documentation and working rules
LICENSE                    MIT license
```

Local books, extracted indexes, uploads, generated audio, `.env`, caches, and
virtual environments are ignored by Git. Never commit copyrighted books or
private reader data.

## Engineering rules

- Work from a short-lived branch and keep one coherent outcome per commit.
- Preserve local books, indexes, generated audio, and unrelated user changes.
- Keep API keys server-side.
- Make one small behavior change with a focused regression test.
- Treat `segment_index` as the only authoritative reading cursor.
- Preserve physical PDF provenance for every narrated segment.
- Do not add book-, author-, publisher-, or page-specific production rules.
- Use only public-domain, openly licensed, generated, or sanitized fixtures.
- Keep candidate extraction engines behind adapters and benchmark them before
  changing production parsing.
- Run `bash scripts/check.sh` before merging.
- Browser changes require a relevant manual smoke test.

### Browser smoke test

After user-facing changes, verify the affected path in a modern browser:

- library load, upload, duplicate detection, and section navigation;
- browser and OpenAI narration without overlapping or stale audio;
- previous, next, pause, continue, repeat paragraph, speed, and section
  transitions;
- new-reader opening choice and returning-reader exact resume;
- Ask by voice pauses at the visible sentence and waits for the reader;
- questions, notes, highlights, and research remain page anchored;
- Continue and Repeat close the microphone before narration resumes;
- manual reading remains available after missing-key and extraction failures.

Record the commit, browser, operating system, narration mode, and any failed
action when reporting a manual check.

## Roadmap

Current priority:

1. Validate the real-key Ask by voice → question/note → Continue loop.
2. Fix the first general parser failure observed in a permitted outline-free
   novel, without adding book-specific rules.
3. Improve cross-page paragraph continuity and complex layout handling through
   the synthetic benchmark.

Later work includes annotation editing/export, bookmarks, voice selection,
sleep timers, arbitrary text selection, book-wide retrieval, EPUB support,
accounts, synchronization, and production deployment.

## License

MIT © 2026 Bhavya Patel
