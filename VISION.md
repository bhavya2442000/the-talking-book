# Talking Book Vision

## The product

Talking Book is a personal AI reading companion. It does not merely turn a PDF
into audio, and it is not primarily a screen that happens to have voice
controls. It creates an ongoing reading relationship between one reader, their
books, and an assistant that can read, listen, remember, discuss, and help the
reader think.

The natural interaction is conversation. The reader should be able to open the
app, hear a useful greeting, continue a book, interrupt at any moment, discuss
an idea, preserve a thought, and return to reading without navigating menus.

The interface still matters, but it serves the conversation. It provides book
upload, microphone and connection state, the current page and passage, a
transcript, notes, highlights, citations, and dependable manual controls. It is
a quiet supporting surface rather than the center of the experience.

## Product principles

### Voice is the primary interaction

Once a book is available and microphone permission has been granted, an
ordinary reading session should not require clicking. Natural phrases should be
enough to control playback, ask questions, save ideas, and resume reading.

The reader does not need to memorize a command language. “Wait,” “hold on,” and
“pause for a second” should express the same intention. The companion should
ask a short clarifying question when an instruction is genuinely ambiguous.

### The book remains authoritative

The companion may explain, summarize, compare, or question the material, but it
must not blur its own reasoning into the author’s words. It should distinguish:

- what the book explicitly says;
- a direct quotation from the book;
- the companion’s interpretation;
- something the reader previously said or saved; and
- information retrieved from an outside source.

Page and passage references should remain available even when the interaction
is entirely spoken.

### Interruption is a core behavior

The reader should be able to speak while narration is playing. The book stops
quickly, preserves its exact position, and gives the reader the floor. It does
not finish another sentence, talk over the reader, or resume unexpectedly.

After the interruption, the reader can give a control instruction or begin a
conversation. Narration resumes only when the reader explicitly says to
continue or uses the manual Play control.

### Memory is useful and understandable

The companion remembers enough to make the next session better:

- which book was active;
- the exact reading position;
- preferred speed, volume, voice, and resume behavior;
- saved highlights and notes;
- recent passage-linked discussions; and
- summaries already produced for unchanged reading ranges.

Memory should be visible and correctable. The reader can inspect or remove a
note, highlight, discussion, or preference rather than treating memory as an
invisible black box.

### The UI supports voice and recovery

The screen should always make the important state legible:

- which book and passage are active;
- whether the microphone is listening, muted, reconnecting, or unavailable;
- whether the companion or book is speaking;
- what the companion heard;
- which action was performed;
- what was saved; and
- how to recover manually if voice fails.

Upload, notes, highlights, transcript, page evidence, and familiar playback
controls remain accessible. Voice-first does not mean inaccessible or
voice-only.

### The reader remains in control

The microphone can always be muted. The reader chooses whether returning to a
book triggers a recap. Destructive actions require confirmation. Outside
research does not happen silently, and the book never resumes on its own after
an interruption.

## The complete reader journey

### 1. Add a book

The reader uploads a book through the minimal supporting interface. The system
prepares the book’s title, author, pages, chapters, paragraphs, sentences, and
reading order. Later versions also identify meaningful figures, diagrams, maps,
tables, and graphs.

Preparation is visible and recoverable. If a page cannot be read correctly,
the reader sees a useful explanation instead of a silent or misleading result.
Once ready, the book becomes part of the reader’s personal library.

### 2. Begin a voice session

The first visit requires an explicit microphone-permission action imposed by
the browser. On later visits, the companion reconnects automatically when the
browser permits it. The microphone is active by default until the reader mutes
or ends the session, and its state is always visible.

The assistant greets the reader by name. The greeting is brief and useful, not
ceremonial.

With one book, it selects that book automatically. With multiple books, it asks
which book the reader wants and understands natural references such as:

- “Let’s continue Sapiens.”
- “The Harari book.”
- “The one about human history.”
- “Continue what we read yesterday.”

When two books are plausible, it asks which one rather than guessing.

### 3. Return to the right place

The companion reports where the reader stopped: the book, chapter, physical PDF
page, and current passage. It can also mention when the previous session ended.

The reader chooses a default return style:

1. **Ask:** give the location and one sentence of context, then ask whether to
   recap or continue.
2. **Automatic recap:** give a short spoiler-safe recap before continuing.
3. **Immediate:** state the location briefly and resume.

If the reader stopped in the middle of a chapter, a recap covers only material
already read. It must not summarize pages ahead of the saved position. At the
beginning of a new chapter, it can recap the previous chapter.

A natural return might sound like:

> Welcome back, Bhavya. We stopped halfway through Chapter 6 on PDF page 123,
> just after the discussion of agricultural surplus. Would you like a short
> recap, or should I continue?

### 4. Read the book

The narration follows the book verbatim and advances through the correct
reading order. The supporting interface follows along, marks the current
sentence, shows the physical page, and keeps familiar playback controls
available.

The reader can control the session conversationally:

- “Continue.”
- “Wait.”
- “Read that again.”
- “Repeat the paragraph.”
- “Go back one sentence.”
- “Skip to the next paragraph.”
- “Read slower.”
- “Set the speed to one point two.”
- “Turn the volume down.”
- “Set the volume to fifty percent.”

Short control commands should result in short acknowledgements. The companion
does not turn every pause or speed change into a conversation.

### 5. Interrupt naturally

The microphone remains available during narration. As soon as the reader begins
speaking, the book pauses and the current position is secured. The system first
stops the audio, then determines what the reader wants.

Examples include:

- “Wait—what does that mean?”
- “Hold on, read that sentence again.”
- “Pause. I want to think about this.”
- “Why does the author believe that?”
- “Is this consistent with the previous chapter?”

The companion does not resume merely because the reader becomes silent. It
waits for “continue,” “go on,” “resume reading,” or the Play control.

### 6. Talk with the book

An interruption may become a real discussion. The companion understands the
active sentence, surrounding paragraph, current page, chapter, and recent
discussion. The reader can ask it to:

- explain a concept in simpler language;
- define a term in context;
- give a concrete example;
- summarize the current argument;
- compare the passage with an earlier part of the book;
- identify an assumption or weakness in the reasoning;
- distinguish fact, opinion, and interpretation; or
- help articulate the reader’s own response.

Answers remain grounded in the relevant pages. If the available book context is
insufficient, the companion says so. It does not invent a claim and attribute
it to the author.

The discussion stays connected to the reading position. When the reader says
“continue,” the companion returns to the exact interrupted passage rather than
starting from a vaguely related location.

### 7. Highlight and take notes

The reader can capture ideas without leaving the conversation:

- “Highlight this sentence.”
- “Highlight this paragraph.”
- “Make a note that this is similar to the argument in Chapter 2.”
- “Save my question about whether this evidence is causal.”
- “Add that explanation to my notes.”
- “What notes did I make on this page?”

“This” means the current sentence by default. If no current passage exists, the
companion asks what the reader intended.

Every highlight preserves its quotation and location. Every note retains its
book, chapter, physical page, nearby passage, creation time, and whether it came
from the reader, the companion, or a discussion. Notes can apply to a sentence,
page, chapter, or the book more generally.

Highlights and notes appear in the interface and survive closing the browser or
restarting the server. They can later be searched, edited, removed, and
exported.

### 8. Preserve discussion memory

The companion remembers relevant passage-linked discussions so the reader does
not have to reconstruct their thinking every time. A future session might say:

> You previously questioned whether the author was treating correlation as
> causation on this page. Would you like me to bring that note back into the
> discussion?

Discussion memory should help continuity without overwhelming the reader. It
is attached to the passage where it occurred, visible in the interface, and
removable by the reader.

### 9. Understand visual material

In the final product, figures are part of the book rather than invisible page
decoration. When the reading position reaches a meaningful visual, the
companion can briefly announce it:

> There is a graph on this page comparing population growth across three
> periods. Would you like me to describe it?

The reader can ask:

- “What does this graph show?”
- “Explain the axes.”
- “What trend is important here?”
- “Read the labels.”
- “How does this diagram support the paragraph?”
- “Describe the map.”

The explanation combines what is visibly present with the caption and nearby
book text. Decorative images are usually skipped. If a visual is low quality or
ambiguous, the companion describes the uncertainty rather than pretending to
see details it cannot verify.

### 10. Bring in outside research

Outside information is optional and clearly separated from the book. The
reader may ask:

- “What do historians disagree with here?”
- “Find reviews that discuss this argument.”
- “Has newer research changed this conclusion?”
- “What do other readers say about this chapter?”

The companion identifies when it leaves the book, provides sources, and keeps
external claims distinct from the author’s position and the companion’s own
interpretation. Useful research can be saved beside the relevant page or note.

### 11. End and return later

When the reader ends the voice session, closes the app, or loses the connection,
the system preserves:

- the active book;
- exact reading position;
- playback preferences;
- highlights and notes;
- relevant discussion history; and
- completed summaries.

The next session begins from this durable state. A temporary network or voice
failure never prevents manual reading or playback.

## Capability areas

### Personal greeting and reader profile

The companion knows the reader’s preferred name and reading preferences. It
uses them to make the session efficient, not to fill the conversation with
unnecessary personalization.

### Conversational book selection

One available book opens automatically. A larger library can be searched by
title, author, topic, or recency through natural language. Ambiguous matches are
confirmed before switching.

### Exact reading and resume behavior

The saved cursor connects audio, visible text, page evidence, conversation, and
annotations. The system preserves the most precise resume location supported by
the narration source and clearly falls back to the start of the current
sentence when finer seeking is unavailable.

### Natural interruption and turn-taking

The system prioritizes giving the reader the floor. Speech onset pauses the
book before interpretation occurs. Silence does not imply permission to resume.

### Spoken playback control

Natural variations map to a small set of dependable actions. The model
interprets the request, while the reader engine performs the action and reports
the result.

### Passage-grounded conversation

The companion retrieves only the context needed for the question. It can use
more of the book when required, but preserves page evidence and avoids treating
model recall as book content.

### Highlights and page-linked notes

Annotations are durable reading artifacts rather than transient chat messages.
They retain location, quotation, provenance, and time.

### Discussion history and reading memory

Recent reasoning can carry across interruptions and sessions. The reader can
inspect, correct, or delete remembered material.

### Spoiler-aware summaries

Summaries respect the saved cursor. They cover the previous chapter or the
already-read part of the current chapter, depending on the reader’s position.

### Image and graph understanding

Visual explanations combine the page image, figure region, labels, caption,
and nearby prose. The system announces only meaningful visuals and communicates
uncertainty.

### External research and commentary

Research occurs explicitly, preserves citations, and remains separate from the
book’s claims. It enriches the reading session without rewriting the source.

### Minimal supporting UI

The interface provides upload, library access, current text and page, microphone
state, transcript, notes, highlights, citations, errors, and manual playback.
It is designed for glanceability and recovery rather than constant operation.

### Privacy, trust, and source attribution

The reader can see when audio is being captured and can mute immediately. The
product explains what is stored locally and what is sent to an external model.
Every important answer identifies whether it comes from the book, interpretation,
reader memory, or research.

### Accessibility and manual fallback

Voice interaction complements keyboard, pointer, and screen-reader access.
Every essential operation remains possible without a microphone. Connection,
hearing, speech, or environmental limitations should not lock the reader out of
their book or notes.

## What the product is not

Talking Book is not intended to replace careful reading with automatic
summaries. It does not impersonate the author, silently search the web, or
present interpretation as fact. It is not dependent on an elaborate visual
dashboard, and it does not make the reader surrender control to an always
speaking agent.

## Definition of success

The final product succeeds when a reader can complete a meaningful session with
only one initial microphone-permission interaction:

1. receive a useful personal greeting;
2. return to the correct book and position;
3. choose whether to recap or continue;
4. listen to accurate narration;
5. interrupt naturally;
6. discuss the active passage with grounded answers;
7. control playback through ordinary speech;
8. create page-linked highlights and notes;
9. resume from the interruption point; and
10. return later with the entire session state intact.

The lasting value is not merely that a book can speak. It is that the book can
become an active place for listening, questioning, reasoning, and remembering.
