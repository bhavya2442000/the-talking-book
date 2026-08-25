# Talking Book Incremental Implementation Plan

## Purpose

This document is the cumulative roadmap from the current local reader to the
voice-first experience described in [VISION.md](VISION.md). It is an
implementation guide, not a claim that the future features already exist.

The work is deliberately divided into small, testable stages. Each phase leaves
the application usable, proves one new capability, and creates a stable
foundation for the next phase. Later phases must not bypass or duplicate the
state, actions, and tool contracts established earlier.

## Delivery rules

1. Keep the current reader operational at the end of every small step.
2. Prefer one behavior change and its tests per change set.
3. Build deterministic state and actions before connecting them to a model.
4. Treat the sentence index as the authoritative reading cursor.
5. Pause locally on detected speech before waiting for transcription or model
   reasoning.
6. Keep manual controls available when microphone, network, or model calls fail.
7. Persist important reader state before adding features that depend on it.
8. Do not introduce images, web research, multiple users, or deployment work
   into the initial voice-control milestone.
9. Mock external model calls in automated tests. Use the real API only for
   bounded end-to-end verification.
10. Update the main README and this roadmap whenever a phase changes status.

## Current verified baseline

The current application is a working local pre-alpha vertical slice.

### Book ingestion and structure

- Upload text-based PDF files up to 50 MiB.
- Validate the extension and PDF signature.
- Avoid duplicate indexing through a SHA-256 source digest.
- Extract physical pages, PDF outline sections, inferred paragraphs, and
  sentence-level segments.
- Connect each sentence to its paragraph, outline section, and PDF page.
- Store the structured book as atomic JSON under `data/books/`.

### Reader

- List and switch between indexed books.
- Navigate publisher-provided outline sections.
- Render one section at a time.
- Click or keyboard-activate a sentence to move the reading cursor.
- Display the current section, physical PDF page, and chapter progress.

### Narration

- Read continuously with browser speech synthesis.
- Optionally use OpenAI speech generation when an API key is configured.
- Play or continue, pause, move one sentence backward or forward, and repeat the
  current paragraph.
- Change speed from `0.7×` to `1.6×`.
- Prefetch the next two OpenAI audio sentences.
- Maintain a bounded client audio-object cache and a server MP3 cache.
- Invalidate stale asynchronous playback to prevent overlapping narration.
- Report Ready, Loading, Playing, Paused, and Error states.

### Reading memory and companion

- Save the sentence index, speed, and narration mode per book in browser
  `localStorage`.
- Offer to continue from a saved position.
- Ask for an explanation of the current passage through the OpenAI Responses
  API.
- Ground the question with the current paragraph and one neighboring paragraph
  on either side, labeled with PDF page numbers.

### Current local book and tests

The current Sapiens index contains:

- 439 physical PDF pages;
- 33 outline sections;
- 2,159 inferred paragraphs;
- 8,152 sentence segments; and
- 141,548 extracted words.

The verified automated baseline is:

- 8 passing Python tests;
- 3 passing JavaScript tests; and
- a valid JavaScript syntax check for `static/app.js`.

### Baseline limitations relevant to this roadmap

- Reader state needed by a voice agent exists only in one browser.
- Playback operations are directly connected to individual button handlers
  rather than a shared action interface.
- There is no microphone, Realtime connection, transcription, or voice command
  path.
- The current cloud narration voice is fixed to `alloy`.
- Volume is not an application-level setting.
- Browser speech cannot reliably seek to a time offset inside a sentence.
- There are no durable highlights, notes, discussion turns, or summaries.
- Companion questions are independent and do not retain conversation history.

## Target architecture

The incremental design uses separate components with clear responsibilities:

```text
Microphone ──WebRTC──> OpenAI Realtime session
                           │
                           │ function call
                           ▼
Browser tool dispatcher ──> deterministic reader actions
         │                         │
         │                         ├── playback engine
         │                         ├── visible reader state
         │                         └── manual controls
         │
         └──HTTP──> FastAPI memory and grounded-context APIs
                           │
                           ├── book JSON
                           ├── reader profile JSON
                           ├── per-book memory JSON
                           └── Responses and Speech APIs
```

The existing cached TTS path remains responsible for verbatim book narration.
The Realtime session is responsible for listening, assistant speech,
conversation, and choosing tools. This split keeps narration deterministic and
cacheable while allowing natural interruption and discussion.

## Shared contracts to establish gradually

These structures are introduced in Phase 1 and extended only through explicit
schema-version changes.

### Reader profile

```json
{
  "schema_version": 1,
  "display_name": "Bhavya",
  "resume_preference": "ask",
  "microphone_default": "on",
  "narration_voice": "alloy",
  "speed": 1.0,
  "volume": 100,
  "updated_at": "ISO-8601 timestamp"
}
```

`resume_preference` is one of `ask`, `auto_recap`, or `immediate`.

### Per-book memory

```json
{
  "schema_version": 1,
  "book_id": "book identifier",
  "reader_state": {
    "section_index": 0,
    "page": 1,
    "segment_index": 0,
    "audio_offset_seconds": null,
    "playback_mode": "cloud",
    "playback_state": "paused",
    "speed": 1.0,
    "volume": 100,
    "last_read_at": "ISO-8601 timestamp"
  },
  "highlights": [],
  "notes": [],
  "discussion_turns": [],
  "summary_cache": [],
  "updated_at": "ISO-8601 timestamp"
}
```

Physical page and section values are derived from the authoritative segment
when state is written. The server rejects an invalid segment rather than
persisting internally inconsistent location data.

### Highlight

```json
{
  "id": "stable identifier",
  "segment_start": 100,
  "segment_end": 100,
  "page": 12,
  "section_index": 2,
  "quote": "Exact text from the book.",
  "source": "voice",
  "created_at": "ISO-8601 timestamp"
}
```

### Note

```json
{
  "id": "stable identifier",
  "text": "The reader's note.",
  "scope": "sentence",
  "segment_index": 100,
  "page": 12,
  "section_index": 2,
  "quote": "Nearby book text used as the anchor.",
  "source": "voice",
  "created_at": "ISO-8601 timestamp"
}
```

`scope` is one of `sentence`, `paragraph`, `page`, `chapter`, or `book`.

### Discussion turn

```json
{
  "id": "stable identifier",
  "segment_index": 100,
  "page": 12,
  "section_index": 2,
  "user_text": "Why is this important?",
  "assistant_text": "Grounded response text.",
  "created_at": "ISO-8601 timestamp"
}
```

### Reader action result

Every deterministic reader action returns a common shape:

```json
{
  "ok": true,
  "action": "pause_reading",
  "message": "Reading paused.",
  "reader_state": {},
  "error": null
}
```

Failures set `ok` to `false`, leave the reader in a valid state, and provide a
recoverable error code and short message.

## Phase 0 — Protect the current baseline

### Goal

Create a reliable regression boundary before introducing persistent memory,
shared actions, or a live microphone.

### Why this phase comes first

Voice work touches playback, state, network calls, and asynchronous events.
Without a clear baseline, a new voice behavior could quietly break upload,
manual playback, saved position, or explanations. This phase defines what must
continue working throughout the roadmap.

### Dependencies

None. This phase starts from the current repository.

### Small implementation steps

#### 0.1 Record the baseline

1. Keep the current feature inventory in the main README accurate.
2. Record the current test commands and expected pass counts.
3. Record the current Sapiens index counts as a parser regression reference.
4. Treat the sentence `segment_index` as the authoritative cursor in all future
   work.

#### 0.2 Expand pure playback coverage

1. Test cursor movement at the beginning and end of a book.
2. Test repeat-paragraph start selection.
3. Test chapter progress for one-segment and ordinary sections.
4. Test stale playback-token invalidation independently of browser audio.
5. Test that prefetch never requests beyond the final segment.

#### 0.3 Expand backend regression coverage

1. Test invalid book and segment identifiers.
2. Test upload size and PDF-signature validation.
3. Test duplicate upload behavior.
4. Test grounded context at the first and last paragraph.
5. Test distinct audio cache entries for different models and voices.

#### 0.4 Create a manual smoke checklist

Verify:

1. the library loads;
2. a chapter opens;
3. a sentence can be selected with pointer and keyboard;
4. browser narration plays, pauses, continues, and advances;
5. OpenAI narration plays without overlap;
6. Previous, Next, and Repeat paragraph work;
7. speed changes apply;
8. a saved position restores after reload; and
9. the companion explains the selected passage.

### Data and interface changes

No production data or public API changes. Only regression tests and
documentation are added.

### Test scenarios

- Run all existing Python and JavaScript tests.
- Run the expanded playback and API cases.
- Complete the manual smoke checklist in browser and cloud narration modes.

### Completion criteria

- The baseline is documented.
- Existing checks remain green.
- Important cursor, boundary, cache, and error behaviors have direct coverage.
- The smoke checklist can be repeated after every later phase.

### Foundation for the next phase

Phase 1 can change persistence with confidence that reader and playback
regressions will be detected.

## Phase 1 — Durable personal reading memory

### Goal

Make reader identity, preferences, position, highlights, notes, and discussion
memory available to the local server and future voice tools.

### Why this phase comes now

A voice companion cannot greet the reader, describe where they stopped, or save
a note reliably if important state lives only in one browser. Persistence must
precede voice commands so subsequent phases depend on one durable source of
truth.

### Dependencies

- Phase 0 regression baseline.
- Existing `BookStore` atomic-write pattern as a reference.

### Small implementation steps

#### 1.1 Add versioned reader storage

1. Create a local reader-data store separate from parsed book indexes.
2. Store the profile and one memory document per book.
3. Write through a temporary file and atomic rename.
4. Protect in-process reads and writes with a lock.
5. Validate the schema before caching a document.
6. Never overwrite a valid file with a malformed update.

#### 1.2 Add the personal profile

1. Store the reader’s display name.
2. Store `ask`, `auto_recap`, or `immediate` as the resume preference.
3. Store microphone default, narration voice, speed, and volume.
4. Provide safe defaults when the file does not exist.
5. Preserve unknown future fields during ordinary updates when practical.

#### 1.3 Add per-book reader state

1. Store the current segment.
2. Derive and store its physical page and section.
3. Store playback mode, state, speed, and volume.
4. Store an audio offset when the active engine provides one.
5. Store the last-read timestamp.
6. Reject segment indexes outside the book.

#### 1.4 Add empty memory collections

1. Add highlights.
2. Add notes.
3. Add discussion turns.
4. Add a summary cache placeholder.
5. Do not expose creation UI until the relevant later phase.

#### 1.5 Add local APIs

Add endpoints for:

1. getting and updating the reader profile;
2. getting per-book memory;
3. updating per-book reader state; and
4. returning validation errors without corrupting stored state.

Use partial updates only for explicitly allowed fields. The backend derives
page and section from the segment rather than trusting client values.

#### 1.6 Migrate browser state safely

1. On first load, check for server state.
2. If none exists, import the existing local segment, speed, and narration mode.
3. Mark the import complete.
4. During this phase, continue writing `localStorage` as a fallback.
5. Prefer the most recently updated valid state when both exist.
6. Never discard a saved browser position merely because a server update fails.

#### 1.7 Handle damaged or missing data

1. Missing files produce defaults.
2. Invalid JSON is reported and preserved for manual recovery.
3. Unknown book IDs return a clear error.
4. An invalid saved segment falls back to the book’s first readable segment.
5. A failed write leaves the previous valid document intact.

### Data and interface changes

- Add `data/reader/profile.json`.
- Add `data/reader/books/{book_id}.json`.
- Add versioned profile and book-memory schemas.
- Add profile and reader-state API routes.
- Add volume as a persisted reader preference, without yet requiring voice
  control.

### Test scenarios

- Create, read, update, and reload a profile.
- Create and restore per-book state after a new store instance.
- Reject invalid segments and bounded settings.
- Simulate a failed atomic write and verify old data survives.
- Load missing and malformed files.
- Import current `localStorage` state once.
- Resolve browser/server timestamp precedence.
- Confirm the existing resume prompt still selects the correct sentence.

### Completion criteria

- A server restart and browser reload restore the same book and sentence.
- Speed, volume, narration mode, and resume preference persist.
- No invalid update corrupts the last good state.
- Current manual playback and explanations still pass the Phase 0 checklist.

### Foundation for the next phase

Phase 2 can return consistent state from every reader action and future voice
tools can access durable preferences and location.

## Phase 2 — Deterministic reader action layer

### Goal

Create one programmatic action interface used by buttons, keyboard behavior,
and future Realtime tools.

### Why this phase comes now

Connecting a model directly to individual DOM handlers would make voice control
fragile and difficult to test. The app first needs deterministic operations
with validated inputs, predictable results, and one owner for state changes.

### Dependencies

- Durable reader state from Phase 1.
- Playback regression coverage from Phase 0.

### Small implementation steps

#### 2.1 Define the dispatcher

1. Accept an action name, arguments, and optional request ID.
2. Validate the action and arguments before changing state.
3. Execute only one state-changing action at a time.
4. Return the common action-result structure.
5. Persist state after successful operations.
6. Keep errors recoverable and visible.

#### 2.2 Move existing transport controls

Move one control at a time behind the dispatcher:

1. `pause_reading`
2. `continue_reading`
3. `move_reading` for previous or next sentence
4. `repeat_current` for a sentence
5. `repeat_current` for a paragraph
6. `set_speed`

After each move, keep the current button connected to the new action and rerun
playback tests.

#### 2.3 Add volume

1. Define volume as an integer from 0 to 100.
2. Apply it to generated audio.
3. Apply it to new browser speech utterances.
4. Persist the setting.
5. Reflect changes in the supporting controls.

#### 2.4 Add read-only context actions

1. `get_reading_state` returns the active title, chapter, page, segment, playback
   state, speed, and volume.
2. `get_current_context` returns the active sentence, paragraph, neighboring
   text, and page labels.
3. Neither operation changes or advances playback.

#### 2.5 Add annotation action placeholders

Define but do not yet expose through voice:

1. `highlight_current` with sentence or paragraph scope.
2. `save_note` with text and scope.
3. `list_recent_notes`.
4. `delete_annotation`, which always requires confirmation.

#### 2.6 Add companion action placeholders

1. `explain_current` accepts a question and uses the current cursor.
2. `summarize_current` accepts a bounded scope.
3. Both pause narration before beginning a response.
4. Neither resumes narration automatically.

#### 2.7 Prevent duplicate and conflicting actions

1. Use a request ID for idempotent model-triggered mutations.
2. Reject or serialize conflicting playback operations.
3. Make Pause safe to call repeatedly.
4. Make Continue safe when already playing.
5. Record the last bounded set of executed request IDs.

### Data and interface changes

- Add a browser-side action dispatcher.
- Add action names and bounded argument contracts.
- Extend persisted state with volume.
- Standardize action results for UI and future tool calls.

### Test scenarios

- Trigger every action directly without clicking a button.
- Verify buttons call the same actions.
- Test invalid speed, volume, direction, and unit values.
- Test repeated Pause and Continue.
- Test duplicate mutation request IDs.
- Test conflicting movement during audio loading.
- Confirm annotations use the active page and segment.
- Confirm context actions never alter the cursor.

### Completion criteria

- Every existing manual reader control uses the dispatcher.
- Programmatic actions produce the same visible and playback behavior as manual
  controls.
- Results are structured and testable.
- Invalid or duplicate actions cannot corrupt reader state.

### Foundation for the next phase

Phase 3 can connect a live model without allowing the model to manipulate DOM
state or playback details directly.

## Phase 3 — Realtime connection proof

### Goal

Create a reliable browser-to-OpenAI Realtime voice session that can greet the
reader but does not control the book yet.

### Why this phase comes now

WebRTC connection, permission, lifecycle, and audio output are complex enough
to prove independently. Playback tools remain disconnected until the voice
transport is stable.

### Dependencies

- Phase 2 action contracts exist but are not exposed to Realtime yet.
- An OpenAI API key is configured on the server.
- The installed OpenAI SDK supports Realtime call creation.

### Small implementation steps

#### 3.1 Add configuration reporting

1. Add `OPENAI_REALTIME_MODEL` with `gpt-realtime-2.1` as the initial default.
2. Report whether Realtime is available without returning credentials.
3. Keep the app usable when Realtime is not configured.

#### 3.2 Add the SDP session endpoint

1. Accept browser SDP as `application/sdp`.
2. Require a valid active book ID.
3. Build server-controlled session instructions.
4. Create the Realtime call through the OpenAI SDK.
5. Return answer SDP as `application/sdp`.
6. Convert authentication, quota, and upstream failures into clear local errors.
7. Never expose the standard API key to the browser.

Follow the official [Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc).

#### 3.3 Create the browser connection

1. Create an `RTCPeerConnection`.
2. Add a Realtime data channel.
3. Request the microphone with echo cancellation, noise suppression, and
   automatic gain control.
4. Add the microphone track.
5. attach remote assistant audio to a dedicated audio element.
6. Exchange SDP through the backend.
7. wait for the connection before requesting a greeting.

#### 3.4 Model the connection lifecycle

Represent:

1. disconnected;
2. requesting permission;
3. connecting;
4. listening;
5. muted;
6. reconnecting; and
7. error.

Expose the state in the interface and to accessibility APIs.

#### 3.5 Add permission and mute behavior

1. Show one explicit Enable microphone action on first use.
2. After permission exists, attempt automatic session start on later visits when
   browser policy permits.
3. Keep the microphone active by default during the session.
4. Muting disables the outgoing track without destroying the connection.
5. Ending the session stops tracks, closes the peer connection, clears handlers,
   and releases audio resources.

#### 3.6 Add a bounded greeting

1. Provide the display name and active book title.
2. Ask for one brief spoken greeting.
3. Do not summarize, resume narration, or expose reader tools yet.
4. Show the assistant transcript in the supporting interface.

#### 3.7 Add graceful failure

1. Time out a connection that never establishes.
2. Surface permission denial separately from API failure.
3. Allow manual retry.
4. Do not block reading or manual narration.

### Data and interface changes

- Add Realtime model configuration.
- Add an SDP session endpoint.
- Add browser connection and microphone lifecycle state.
- Add a microphone toggle and connection status.
- No reader actions are exposed to the model yet.

### Test scenarios

- Mock successful SDP creation.
- Test missing key, invalid book, and upstream API failure.
- Mock peer-connection and data-channel events.
- Test permission granted, denied, and dismissed.
- Test mute, unmute, disconnect, and cleanup.
- Test a dropped connection and manual retry.
- Verify the ordinary reader works when Realtime is unavailable.
- Perform one bounded real-API greeting test.

### Completion criteria

- The reader can enable a live voice session and hear a short greeting.
- Microphone state is always visible and controllable.
- Connections and media tracks clean up correctly.
- Failure does not affect book reading or manual narration.

### Foundation for the next phase

Phase 4 can use Realtime speech-start events to interrupt narration without yet
depending on language understanding.

## Phase 4 — Immediate interruption

### Goal

Stop narration quickly when the reader begins speaking and preserve the most
precise available resume position.

### Why this phase comes now

Interruption should not wait for transcription, model inference, or a function
call. Proving local pause-on-speech first provides the fundamental turn-taking
behavior on which every voice command and discussion depends.

### Dependencies

- Stable Realtime data channel from Phase 3.
- Shared pause and state actions from Phase 2.
- Durable cursor and optional audio offset from Phase 1.

### Small implementation steps

#### 4.1 Enable voice activity detection

1. Start with server VAD.
2. Enable speech-start and speech-stop events.
3. Enable interruption of an active assistant response.
4. Keep settings configurable for later tuning.

Follow the official [Realtime VAD guide](https://developers.openai.com/api/docs/guides/realtime-vad).

#### 4.2 Pause on speech start

1. Listen for the first speech-start event.
2. Dispatch Pause immediately.
3. Save the active segment before other work.
4. Save the current generated-audio time when available.
5. Cancel automatic sentence advancement.
6. Keep prefetched audio cached but prevent it from beginning.
7. Enter an interrupted state.

#### 4.3 Define resume precision

1. Generated MP3 narration resumes from its saved time when the same audio is
   still available.
2. If the MP3 must be recreated, restore its time after loading.
3. Browser speech falls back to restarting the current sentence because it does
   not offer reliable time seeking.
4. Show the active sentence in every fallback.

#### 4.4 Prevent unwanted continuation

1. Speech-stop does not resume the book.
2. A completed Realtime answer does not resume the book.
3. Silence does not resume the book.
4. Only a Continue action or manual Play resumes narration.

#### 4.5 Measure and diagnose

1. Record the time between speech-start and local pause.
2. Count false speech starts during narration.
3. Make the latest VAD event and interruption result visible in development
   diagnostics.
4. Test speaker playback and headphones separately.

### Data and interface changes

- Add interrupted as a voice/reader coordination state.
- Persist `audio_offset_seconds` when available.
- Add configurable VAD settings.
- Add local interruption metrics for development.

### Test scenarios

- Speech-start while browser narration is playing.
- Speech-start while cloud audio is playing.
- Speech-start while cloud audio is still loading.
- Multiple speech-start events for one utterance.
- Speech-stop without a command.
- Prefetched audio after interruption.
- Manual Play after the voice connection fails.
- Reload after an interruption with and without an audio offset.

### Completion criteria

- Detected speech pauses narration in approximately one second or less.
- No additional sentence starts after interruption.
- The current segment remains correct.
- Cloud narration can resume at its saved offset when available.
- Narration never resumes from silence alone.

### Foundation for the next phase

Phase 5 can focus exclusively on understanding and executing commands because
the reader already receives the floor reliably.

## Phase 5 — Core spoken playback commands

### Goal

Control the deterministic reader through natural voice requests and Realtime
function calls.

### Why this phase comes now

The transport, interruption path, and action dispatcher are already proven.
This phase only maps model-selected tools to existing operations, limiting the
number of new failure modes introduced at once.

### Dependencies

- Realtime session and data channel from Phase 3.
- Immediate pause-on-speech from Phase 4.
- Deterministic action dispatcher from Phase 2.

### Small implementation steps

Add one tool at a time. Complete its schema, dispatcher connection, result,
idempotency, automated tests, and real voice check before adding the next.

#### 5.1 `pause_reading`

- No arguments.
- Idempotent when already paused.
- Usually needs no spoken acknowledgement beyond a short “Paused” when useful.

#### 5.2 `continue_reading`

- No arguments.
- Resumes the saved audio offset or current sentence fallback.
- Does nothing harmful if already playing.

#### 5.3 `repeat_current`

- Argument `unit`: `sentence` or `paragraph`.
- Defaults to sentence only when the reader says “that” or “this.”
- Restarts the selected unit and begins playback.

#### 5.4 `move_reading`

- Arguments: `direction` and `unit`.
- `direction`: `previous` or `next`.
- Initial `unit`: `sentence` or `paragraph`.
- Chapter movement is added only after sentence and paragraph behavior is solid.

#### 5.5 `set_speed`

- Accept an explicit rate from `0.7` to `1.6`.
- Translate relative phrases such as “slower” into one `0.1` step.
- Report the resulting rate.

#### 5.6 `set_volume`

- Accept an integer from `0` to `100`.
- Translate “up” or “down” into a ten-point change.
- Report the resulting level.

#### 5.7 `get_reading_state`

- Read-only.
- Return book, chapter, page, sentence, playback status, speed, and volume.
- Use it when the reader asks where they are.

#### 5.8 Handle function-call events

1. Collect complete tool arguments.
2. Reject malformed JSON.
3. Check the Realtime call ID for prior execution.
4. Dispatch the action.
5. Send structured function output back to the session.
6. Request a response only when an acknowledgement or clarification is needed.
7. Record the visible transcript and action outcome.

#### 5.9 Clarify ambiguous requests

1. “Go back” without a unit defaults to one sentence.
2. “Repeat that” means the current sentence.
3. Values outside allowed bounds are clamped only for relative changes; invalid
   explicit values receive a correction.
4. A command with two incompatible actions receives clarification.
5. Destructive actions are not part of this phase.

### Data and interface changes

- Add Realtime function definitions for seven core tools.
- Add processed-call-ID tracking.
- Add visible command transcript and action result.
- Do not give the model direct access to DOM or audio objects.

### Test scenarios

- Natural variants of pause, continue, repeat, back, next, speed, and volume.
- Commands issued during playback, loading, paused, and interrupted states.
- Duplicate call IDs.
- Malformed and incomplete arguments.
- Minimum and maximum cursor, speed, and volume boundaries.
- Two commands in one spoken turn.
- Real microphone verification for each tool.
- Manual controls after a tool error.

### Completion criteria

- Common voice variations reliably produce the intended reader action.
- Duplicate calls do not duplicate mutations.
- Invalid requests leave the reader in a valid state.
- Manual and voice controls remain synchronized.

### Foundation for the next phase

Phase 6 can compose greeting and resume behavior from durable state and proven
voice actions rather than embedding playback decisions in prompts.

## Phase 6 — Personal greeting and resume conversation

### Goal

Make a new voice session recognize the reader, report the correct location, and
follow the reader’s chosen recap behavior.

### Why this phase comes now

Greeting and resume combine profile memory, book state, summaries, voice output,
and Continue. Those underlying components must work before the product can make
the return experience feel natural.

### Dependencies

- Personal profile and per-book state from Phase 1.
- Voice session from Phase 3.
- Spoken Continue and state tools from Phase 5.

### Small implementation steps

#### 6.1 Build a resume-context response

1. Load display name.
2. Load the only active book automatically.
3. Load saved section, page, segment, and last-read time.
4. Derive a short passage anchor.
5. Never send the whole book to the greeting session.

#### 6.2 Implement the `ask` preference

1. State the location.
2. Give one spoiler-safe sentence of context.
3. Ask whether to recap or continue.
4. Wait for the choice.

This is the default preference.

#### 6.3 Implement `immediate`

1. State the location briefly.
2. Dispatch Continue after the greeting completes.
3. Cancel continuation if the reader interrupts the greeting.

#### 6.4 Implement `auto_recap`

1. Determine the safe summary range.
2. Produce a short recap.
3. Ask whether to continue unless the reader has explicitly configured automatic
   continuation as a later separate preference.

#### 6.5 Make summaries spoiler-aware

1. At a chapter start, summarize the previous completed chapter.
2. Mid-chapter, summarize only from chapter start through the paragraph before
   the active cursor.
3. Never include later paragraphs.
4. Label the source range with pages.
5. Say when too little material has been read for a useful recap.

#### 6.6 Cache stable summaries

1. Key by book ID, scope, start segment, end segment, and text model.
2. Reuse only an exact range match.
3. Invalidate when the indexed text or model changes.

#### 6.7 Update preferences

1. Add a supporting resume-preference control.
2. Add a voice-settable preference after the manual update path is tested.
3. Confirm the new preference verbally and visibly.

### Data and interface changes

- Activate the profile `resume_preference`.
- Add a bounded summary endpoint or action.
- Activate `summary_cache` records.
- Extend Realtime session context with personal and saved-position information.

### Test scenarios

- No saved state.
- Saved state mid-chapter.
- Saved state at a chapter start.
- Saved state at the final sentence.
- Each of the three resume preferences.
- Summary range never extending beyond the cursor.
- Cached and uncached recap.
- Interruption during greeting or recap.
- Continue after greeting.

### Completion criteria

- The reader is greeted by the configured name.
- The only book is selected automatically.
- The spoken location matches the visible cursor and physical page.
- All resume preferences behave as defined.
- No recap reveals unread text.

### Foundation for the next phase

Phase 7 can attach durable annotations to the same trusted book and cursor
context used by greeting and resume.

## Phase 7 — Voice-created highlights and notes

### Goal

Let the reader preserve quotations, questions, and reasoning without leaving
the voice conversation.

### Why this phase comes now

Annotation storage and placeholder actions already exist. Adding them after
core voice control ensures a failed note cannot destabilize playback or
interruption behavior.

### Dependencies

- Versioned per-book memory from Phase 1.
- Annotation actions from Phase 2.
- Stable tool calling from Phase 5.

### Small implementation steps

#### 7.1 Complete manual highlights

1. Create a sentence highlight from the current cursor.
2. Create a paragraph highlight from paragraph boundaries.
3. Copy the exact indexed quotation into the record.
4. Persist page, section, and segment range.
5. Render it in the reader and annotations list.
6. Restore it after reload.

#### 7.2 Add `highlight_current`

1. Expose sentence and paragraph scopes to Realtime.
2. Default “highlight this” to the current sentence.
3. Ask for clarification only when no reliable cursor exists.
4. Return the saved quotation and page.

#### 7.3 Complete manual notes

1. Accept note text.
2. Accept sentence, paragraph, page, chapter, or book scope.
3. Attach the current segment and a nearby quote.
4. Persist provenance and timestamp.
5. Render and restore notes.

#### 7.4 Add `save_note`

1. Require non-empty note text.
2. Default scope to the current sentence or active discussion.
3. Preserve the reader’s words without silently rewriting them.
4. Optionally store a companion-generated explanation only when explicitly
   requested.
5. Confirm what was saved and where.

#### 7.5 Add `list_recent_notes`

1. Default to the active page or chapter.
2. Limit spoken results to a useful number.
3. Show the full list in the interface.
4. Allow follow-up by stable note ID or ordinal reference within the result.

#### 7.6 Add safe deletion

1. Select the annotation explicitly.
2. Ask for confirmation.
3. Delete only after confirmation.
4. Return enough information to undo in a later enhancement.

#### 7.7 Prepare for export

1. Keep stable IDs and ISO timestamps.
2. Preserve exact quotations separately from note text.
3. Avoid presentation-specific HTML in stored records.
4. Keep ordering deterministic.

### Data and interface changes

- Activate highlight and note collections.
- Add create/list/delete annotation APIs.
- Add four Realtime annotation tools.
- Add supporting highlight and notes views.

### Test scenarios

- Sentence and paragraph highlights at boundaries.
- Notes for every scope.
- Reload and server restart persistence.
- Duplicate function calls.
- Missing note text.
- “Highlight this” with and without an active cursor.
- Listing page and chapter notes.
- Confirmed and cancelled deletion.
- Invalid stored annotation recovery.

### Completion criteria

- A spoken highlight retains the exact quote and correct page.
- A spoken note retains the reader’s text and correct location.
- Both appear in the supporting UI and survive restart.
- Deletion cannot occur without confirmation.

### Foundation for the next phase

Phase 8 can preserve meaningful discussion turns and save companion explanations
using the established memory and annotation contracts.

## Phase 8 — Grounded voice conversation

### Goal

Support a natural passage-linked discussion, preserve useful turns, and return
to narration without losing position.

### Why this phase comes now

Conversation depends on reliable interruption, context retrieval, tools,
annotations, and durable state. Introducing it after those foundations prevents
the live model from becoming the hidden owner of reading state or memory.

### Dependencies

- Interruption from Phase 4.
- Tool execution from Phase 5.
- Resume and summaries from Phase 6.
- Durable notes from Phase 7.

### Small implementation steps

#### 8.1 Define conversation mode

1. Enter conversation mode after a non-control utterance or explanation tool.
2. Keep narration paused.
3. Preserve the interrupted cursor and audio offset.
4. Display user and assistant transcripts.
5. Exit only through Continue, explicit return-to-reading language, or manual
   Play.

#### 8.2 Add grounded passage retrieval

1. Begin with the active paragraph and neighbors.
2. Include physical page labels and section title.
3. Expand within the chapter only when the question requires it.
4. Avoid sending the entire book to the Realtime context.
5. State when the available text is insufficient.

#### 8.3 Add `explain_current`

1. Accept the reader’s question.
2. Retrieve passage context using the saved cursor.
3. Use the existing Responses integration for grounded reasoning when the
   question exceeds a short live response.
4. Return the answer and supporting pages to Realtime.
5. Speak the answer without advancing narration.

#### 8.4 Add `summarize_current`

1. Support sentence, paragraph, already-read chapter portion, and previous
   chapter scopes.
2. Reuse Phase 6 spoiler boundaries.
3. Preserve supporting pages.
4. Cache stable chapter-range summaries.

#### 8.5 Distinguish sources

In instructions and output:

1. “The book says” requires supplied book evidence.
2. “My interpretation” labels model reasoning.
3. “You noted” refers only to stored reader memory.
4. Outside claims are unavailable until Phase 12.

#### 8.6 Preserve discussion turns

1. Store completed user and assistant turns.
2. Attach the interrupted page, section, and segment.
3. Do not store incomplete audio fragments as durable discussions.
4. Keep a bounded recent context in the live session.
5. Make older turns available through retrieval rather than permanent prompt
   inclusion.

#### 8.7 Save an insight from discussion

1. Let the reader say “save that explanation.”
2. Present or identify the exact text to save.
3. Create a note linked to the active passage.
4. Mark whether the content originated from the reader or assistant.

#### 8.8 Return to reading

1. End the current assistant response.
2. Restore the interrupted cursor.
3. Resume the audio offset or sentence fallback.
4. Clear transient discussion output without deleting history.
5. Prevent the discussion response from firing automatic segment advancement.

### Data and interface changes

- Activate discussion-turn persistence.
- Add grounded-context and summary APIs as needed.
- Expose explanation and summary tools to Realtime.
- Add conversation state and transcript UI.
- Add source labels and page evidence.

### Test scenarios

- Interrupt and ask a simple explanation.
- Ask a follow-up question.
- Ask about content outside supplied context.
- Save a reader insight and assistant explanation.
- Verify source labels.
- Verify discussion location after chapter navigation.
- Continue after short and long answers.
- Interrupt the assistant answer.
- Reload and view prior discussion.
- Confirm no discussion advances the book.

### Completion criteria

- The reader can interrupt, discuss the current passage, save an insight, and
  continue from the correct location.
- Answers cite supplied book pages and admit insufficient context.
- Discussion turns remain attached to their passage and survive restart.
- Book narration and assistant speech never overlap unintentionally.

### Foundation for the next phase

Phase 9 can refine a complete end-to-end voice session based on real usage
rather than speculative tuning.

## Phase 9 — Voice reliability and finesse

### Goal

Make the complete one-book voice loop comfortable and recoverable during
extended personal reading.

### Why this phase comes now

VAD thresholds, acknowledgement style, reconnection, echo behavior, and command
aliases should be tuned against a working end-to-end system. Premature tuning
would optimize isolated pieces rather than the actual reading experience.

### Dependencies

- Complete voice control through Phase 5.
- Greeting and annotations through Phases 6–7.
- Grounded conversation through Phase 8.

### Small implementation steps

#### 9.1 Formalize the coordination state machine

Define valid transitions among:

- disconnected;
- connecting;
- listening;
- narrating;
- interrupted;
- conversing;
- muted;
- reconnecting; and
- error.

Reject or queue events that are invalid for the current state.

#### 9.2 Tune turn detection

1. Measure speech-start latency.
2. Measure false starts caused by narration.
3. Adjust threshold, prefix padding, and silence duration.
4. Compare server and semantic VAD only after baseline measurements.
5. Keep a reliable configuration reset.

#### 9.3 Improve echo and environment handling

1. Test headphones.
2. Test laptop speakers at several volumes.
3. Test quiet and noisy rooms.
4. Detect repeated false interruptions.
5. Offer a useful headphone or mute suggestion when needed.

#### 9.4 Add bounded reconnection

1. Detect disconnected and failed peer connections.
2. Retry with increasing delays and a fixed maximum.
3. Preserve book state while reconnecting.
4. Require a manual retry after the maximum.
5. Never create simultaneous Realtime sessions accidentally.

#### 9.5 Refine responses

1. Keep command acknowledgement brief.
2. Avoid repeating the page after every action.
3. Confirm notes and irreversible operations clearly.
4. Add natural aliases discovered from actual use.
5. Do not let personality interfere with reading flow.

#### 9.6 Add local diagnostics

Record without storing raw microphone audio:

1. session connection outcome;
2. interruption latency;
3. tool name and success;
4. duplicate-call suppression;
5. reconnection count;
6. API error category; and
7. approximate usage when available.

#### 9.7 Improve failure messaging

1. Separate microphone permission, network, authentication, rate-limit, and
   model errors.
2. Provide one clear recovery action.
3. Preserve manual reading during every failure.
4. Avoid exposing secret or low-level upstream details.

### Data and interface changes

- Formal state-machine representation.
- Configurable VAD settings.
- Bounded local diagnostic records.
- No raw microphone recordings by default.

### Test scenarios

- Thirty-minute mixed reading and conversation session.
- Frequent pause/continue cycles.
- Rapid repeated commands.
- Assistant interrupted mid-answer.
- Network offline and restored.
- Expired or failed session.
- Permission revoked while active.
- Speaker echo and background noise.
- Manual fallback throughout errors.

### Completion criteria

- Extended sessions do not lose the cursor or overlap audio.
- Connections recover within bounded rules.
- False interruptions are understood and acceptably rare for personal use.
- Errors explain what happened and preserve manual operation.

### Foundation for the next phase

The one-book personal voice companion is now a dependable product core.
Multiple-book selection can be added without changing its reader state or tool
architecture.

## Phase 10 — Multiple-book voice selection

### Goal

Extend the proven companion from one automatically selected book to a small
personal library.

### Why this phase comes later

Book selection is not needed for the current one-book goal. Delaying it keeps
the first voice milestone focused while ensuring every book can later reuse the
same independent memory and action contracts.

### Dependencies

- Stable one-book voice experience through Phase 9.
- Per-book memory already established in Phase 1.

### Small implementation steps

#### 10.1 Add library tools

1. `list_books` returns concise titles and authors.
2. `select_book` accepts a stable ID selected through matching.
3. Neither tool reads full book content into the live prompt.

#### 10.2 Add conversational matching

1. Normalize titles and authors.
2. Support exact title match.
3. Support unique partial title and author match.
4. Support recent-book references.
5. Ask a clarification question for multiple matches.
6. Never select a low-confidence match silently.

#### 10.3 Switch safely

1. Pause current narration.
2. Persist current state.
3. Clear book-specific playback queues.
4. Load the selected book and its memory.
5. Report the restored position.
6. Follow the selected resume preference.

#### 10.4 Adjust greeting

1. Zero books: invite upload through the interface.
2. One book: select automatically.
3. Multiple books: ask or offer the most recent book according to preference.

### Data and interface changes

- Add library list/select tools.
- Add safe book-switch coordination.
- Add optional most-recent-book profile state.

### Test scenarios

- Exact, partial, author, and recent-book requests.
- Ambiguous and nonexistent book requests.
- Switch while playing and while conversing.
- Independent position, annotations, and preferences per book.
- Connection failure during a switch.

### Completion criteria

- “Continue Sapiens” selects the correct book and restores its state.
- Ambiguous requests are clarified.
- Switching never loses the prior book’s position or starts overlapping audio.

### Foundation for the next phase

Visual content can be indexed and addressed per book and page using the same
library and cursor identity.

## Phase 11 — Images, diagrams, maps, and graphs

### Goal

Make meaningful visual content available to narration and grounded discussion.

### Why this phase comes later

Visual extraction introduces page rendering, region detection, multimodal model
calls, new storage, and uncertainty. It should build on a stable reading and
conversation experience rather than block the core voice product.

### Dependencies

- Stable page and book identity.
- Grounded discussion and source labeling from Phase 8.
- Reliable voice session through Phase 9.

### Small implementation steps

#### 11.1 Render pages deterministically

1. Render selected PDF pages at a documented resolution.
2. Cache renders by book digest, page, and render settings.
3. Preserve the coordinate transform between PDF and rendered pixels.

#### 11.2 Detect visual candidates

1. Identify embedded images and large non-text regions.
2. Associate nearby captions.
3. Exclude repeated logos, decorations, and page furniture.
4. Store page and bounding box for every candidate.

#### 11.3 Create visual records

Store:

1. book and page;
2. bounding box;
3. candidate type;
4. caption;
5. nearby paragraph indexes;
6. generated description;
7. confidence or uncertainty; and
8. model/version metadata.

#### 11.4 Describe visuals

1. Send the cropped visual, caption, and nearby text to a vision-capable model.
2. Ask for observable description before interpretation.
3. For graphs, capture axes, labels, units, legend, trends, and notable values.
4. Preserve uncertainty when text is illegible.
5. Cache descriptions.

#### 11.5 Integrate with reading

1. Link each visual to the nearest reading segment.
2. Briefly announce only meaningful visuals.
3. Ask whether the reader wants a description when appropriate.
4. Do not interrupt narration for decorative content.

#### 11.6 Add visual tools

1. `list_visuals_on_page`
2. `describe_current_visual`
3. `explain_current_graph`
4. `relate_visual_to_passage`

### Data and interface changes

- Add cached page renders.
- Add versioned visual records linked to pages and segments.
- Add visual-context APIs and Realtime tools.
- Add a supporting visual preview and page evidence.

### Test scenarios

- Page with no visuals.
- Decorative image.
- Captioned photograph.
- Diagram with labels.
- Graph with legend and axes.
- Multiple visuals on one page.
- Low-resolution or ambiguous visual.
- Cached description and invalidated cache.
- Correct segment and page linkage.

### Completion criteria

- The reader can ask what a current graph or image shows.
- The answer refers to the correct page and visual.
- Observable content and interpretation are distinguished.
- Decorative and uncertain content is handled conservatively.

### Foundation for the next phase

The assistant now has consistent source separation across book text and book
visuals. External research can add a third explicitly labeled source class.

## Phase 12 — Outside research and commentary

### Goal

Enrich the reading discussion with current outside information without
confusing it with the author’s claims.

### Why this phase comes last

Research requires internet access, source evaluation, citations, higher latency,
and additional cost. The product must first be trustworthy when using only the
book and reader memory.

### Dependencies

- Source labeling from Phase 8.
- Stable notes and discussions from Phase 7.
- Visual source handling from Phase 11 when research concerns a figure.

### Small implementation steps

#### 12.1 Require research intent

1. Search only on an explicit research request or confirmation.
2. Do not silently replace an insufficient book answer with web information.
3. Keep manual cancellation available.

#### 12.2 Define research records

Store:

1. reader question;
2. related book, page, and segment;
3. source title and URL;
4. publisher or author;
5. publication and retrieval dates when available;
6. concise supported finding; and
7. source category.

#### 12.3 Retrieve and synthesize

1. Prefer primary and authoritative sources.
2. Retrieve multiple perspectives when the question is interpretive.
3. Separate consensus, disagreement, and uncertainty.
4. Cite every material outside claim.
5. Avoid long copied passages.

#### 12.4 Present source boundaries

Use explicit transitions:

- “The book says…”
- “My interpretation is…”
- “Your saved note says…”
- “Outside research indicates…”

The interface shows links while the spoken answer names the source type.

#### 12.5 Save useful research

1. Let the reader save a finding explicitly.
2. Preserve its citations.
3. Attach it to the relevant passage or discussion.
4. Keep it distinct from the reader’s own note.

#### 12.6 Handle operational limits

1. Show research-in-progress state.
2. Allow cancellation.
3. Handle unavailable pages and sparse evidence.
4. Bound the number of sources and response length.
5. Report external-tool cost or limits when useful.

### Data and interface changes

- Add versioned research records.
- Add an explicit research tool and progress state.
- Add citation display and source-type labels.
- Do not enable automatic background search.

### Test scenarios

- Explicit and ambiguous research requests.
- No useful sources found.
- Conflicting sources.
- Time-sensitive information.
- Cancellation during research.
- Save and reopen a cited finding.
- Verify that a book-only question does not search.
- Verify source labels in speech, transcript, and notes.

### Completion criteria

- Research begins only with reader intent.
- Outside claims retain usable citations.
- Book claims, assistant interpretation, reader notes, and research remain
  clearly distinct.
- Saved research remains linked to the relevant passage.

### Foundation after this phase

The complete product vision is represented: persistent personal reading,
natural voice control, interruption, grounded conversation, annotations,
multiple books, visual understanding, and explicitly sourced research.

## Cross-phase test strategy

### Unit tests

- JSON schema validation and atomic persistence.
- Cursor, section, page, and audio-offset state transitions.
- Action argument validation and idempotency.
- Resume range and spoiler boundaries.
- Annotation and discussion linkage.
- Book matching and visual-record association.
- Source labeling and research record validation.

### Backend API tests

- Profile, state, annotation, discussion, summary, and visual endpoints.
- Realtime SDP proxying with a mocked OpenAI client.
- Missing key, invalid book, malformed input, upstream failure, and rate limits.
- Atomic-write failure and corrupt-file recovery.
- Grounded context range and page evidence.

### Browser tests

- Manual and programmatic actions remain synchronized.
- Mocked peer connection and Realtime data-channel events.
- Permission, mute, disconnect, reconnect, and cleanup.
- VAD speech-start pause behavior.
- Function-call argument collection and duplicate suppression.
- Voice-created annotations appearing at the correct passage.
- Conversation and narration coordination.

### Bounded real-API checks

- Establish and close one Realtime session.
- Greet using current profile and book state.
- Interrupt narration with live microphone input.
- Execute each new tool once.
- Ask one grounded explanation and one spoiler-safe recap.
- Verify no secret reaches the browser.
- Stop narration immediately after each cost-bearing test.

### Manual acceptance session

At the end of Phase 9, run a realistic session:

1. open the app;
2. allow the automatic voice connection;
3. hear the correct greeting and location;
4. choose a recap;
5. begin reading;
6. interrupt with “wait”;
7. ask for an explanation;
8. ask a follow-up;
9. highlight the sentence;
10. save a note;
11. change speed and volume;
12. continue reading;
13. close and reopen the app; and
14. confirm that position, settings, highlight, note, and discussion remain.

## First voice milestone boundary

The first major voice milestone ends after Phase 9. It includes:

- one personal reader;
- one automatically selected book;
- Realtime microphone and assistant speech;
- immediate interruption;
- spoken playback control;
- personal greeting and configurable resume behavior;
- highlights and page-linked notes;
- grounded passage discussion; and
- reliability hardening with manual fallbacks.

It explicitly does not require:

- multiple-book conversational selection;
- image or graph understanding;
- web research;
- accounts or multiple users;
- cloud synchronization;
- deployment infrastructure; or
- replacement of cached TTS with Realtime narration.

Keeping this boundary firm makes the first voice product achievable and gives
real usage a chance to guide later work.

## Overall definition of completion

The roadmap is complete when the experience in `VISION.md` is possible without
making the model the hidden owner of application state. The reader can use
voice for ordinary operation, interrupt immediately, converse with grounded
book context, preserve thoughts, resume accurately, understand meaningful
visuals, and deliberately bring in cited outside research. At every stage, the
supporting interface and deterministic manual controls remain a dependable
fallback.
