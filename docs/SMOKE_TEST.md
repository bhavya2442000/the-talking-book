# Talking Book manual smoke checklist

Run this checklist after the automated quality gate and before declaring a
roadmap phase complete. It protects the existing read, listen, interrupt, and
ask loop while the application evolves.

## Preparation

1. Activate the project virtual environment.
2. Run `bash scripts/check.sh` and require every check to pass.
3. Start the app with `uvicorn app.main:app --reload`.
4. Open <http://127.0.0.1:8000/> in a modern browser.
5. Use a text-based test PDF that you are permitted to process.
6. For the OpenAI checks, configure `OPENAI_API_KEY` in the ignored `.env`
   file. Never record the key in this checklist or a test report.

Record the browser, operating system, narration mode, commit, and date with the
result. If a check fails, capture the visible state and exact action that
triggered it.

## Library and reading

- [ ] The library loads without an error.
- [ ] Uploading a valid text-based PDF creates or returns its book entry.
- [ ] Uploading the same PDF again selects the existing book without creating a
      duplicate.
- [ ] A chapter opens from the contents list.
- [ ] Clicking a sentence updates its highlight, physical PDF page, companion
      passage, and player text.
- [ ] Focusing a sentence and pressing Enter or Space performs the same
      selection.

## Browser narration

- [ ] With OpenAI voice disabled, Play begins the selected sentence.
- [ ] Narration advances to the next sentence when the current sentence ends.
- [ ] At the end of a readable section, narration stops before the next
      section, names both sections, and selects the next section's first
      sentence as the saved cursor.
- [ ] Continue begins the selected next section; Pause here leaves narration
      stopped and Returning reader reports that same section and PDF page.
- [ ] Pause stops narration and Continue resumes without overlapping speech.
- [ ] Previous and Next move exactly one sentence and respect book boundaries.
- [ ] Repeat paragraph returns to the paragraph's first sentence.
- [ ] A speed change applies and remains selected after a reload.

## OpenAI narration

- [ ] OpenAI voice can be enabled only when the server reports a configured
      key.
- [ ] Play produces cloud narration for the selected sentence.
- [ ] Pause, Continue, Previous, Next, and Repeat paragraph do not produce
      overlapping audio.
- [ ] Moving while audio is loading prevents the stale response from playing.
- [ ] Replaying a generated sentence uses the audio cache.
- [ ] Disabling OpenAI voice during playback returns cleanly to browser
      narration.

## Resume and companion

- [ ] Selecting a non-default sentence and reloading offers the saved position.
- [ ] On localhost, New reader shows the first-session opening choice on every
      reload without deleting the saved returning-reader position.
- [ ] Returning reader identifies the saved section, physical PDF page, and
      approximate section progress.
- [ ] Continue reading restores the exact sentence, page, and chapter and
      begins narration.
- [ ] Start over dismisses the saved position and begins the recommended
      opening passage.
- [ ] With an OpenAI key, Quick recap summarizes only the nearby saved passage
      and leaves the saved sentence unchanged.
- [ ] Asking about the selected passage returns an answer grounded in nearby
      book text.
- [ ] The answer cites a physical PDF page when useful.
- [ ] A question outside the supplied context is not attributed to the book.

## Re-analysis

- [ ] Re-analyze book disables while processing and leaves the current reader
      usable until the new index is ready.
- [ ] A successful re-analysis refreshes Contents and the opening choice
      without deleting or replacing the original PDF.
- [ ] Returning reader resumes the same page and sentence when it remains
      eligible, or reports and uses the nearest readable passage when it does
      not.
- [ ] A missing original PDF or extraction failure leaves the previous book
      index and manual reading controls available.

## First session and live voice

- [ ] With two or more books and no started session, the app selects no book and
      presents a first-visit library welcome with every extracted title/author.
- [ ] Pressing Play once at the library welcome requests microphone permission,
      speaks the available books, and listens for a natural spoken choice.
- [ ] Saying a real book title loads it, asks for its recommended opening or
      mapped main chapter, and listens for that choice without another click.
- [ ] Saying the opening choice begins the correct passage without overlapping
      welcome audio or a model-generated explanation. Visible choices remain
      usable as fallback.
- [ ] With one book, the app skips library selection and presents that book's
      opening choice directly.
- [ ] A returning reader bypasses the first-visit welcome and opens their most
      recently used book with the existing resume description.
- [ ] A new reader session introduces the extracted title and author.
- [ ] A detected preface or introduction is presented as the recommended
      opening, while Skip starts at the first eligible main-text passage.
- [ ] Ask by voice stops narration at the visible sentence before requesting
      microphone access; no microphone remains active during ordinary reading.
- [ ] The companion waits silently for the reader's first request and receives
      the stopped sentence, its paragraph, section, and physical PDF page.
- [ ] Asking a question answers from that stopped passage without changing the
      authoritative sentence cursor.
- [ ] Saying Continue closes the voice session, releases the microphone, and
      resumes that same sentence. Pressing Continue reading does the same.
- [ ] Saying Repeat closes the voice session and starts the stopped paragraph.
- [ ] Saying “Take a note that …” saves the intended note beside the current
      passage and labels it with the correct physical PDF page.
- [ ] Saying “Highlight this sentence” highlights only the current sentence;
      “Highlight this paragraph” highlights every sentence in that paragraph.
- [ ] Notes and highlights survive reload and remain attached to the same quote
      and page after navigation.
- [ ] Saying “Research …” pauses at the current passage, saves a concise external
      research card there, preserves clickable source links, and never presents
      the research as book text.
- [ ] A failed research request saves nothing and the companion reports the
      failure while leaving manual reading controls available.
- [ ] The voice companion answers about the visible
      passage without inventing unsupported book details.
- [ ] Speaking while the companion responds interrupts it cleanly.
- [ ] Completed user and companion transcripts appear in recent memory, remain
      bounded, and can be cleared.
- [ ] Natural requests to continue reading or repeat the current paragraph use
      the same reader-control path, end the voice session, release the
      microphone, and narrate from the correct sentence. Requests to continue
      or repeat the companion's explanation do not trigger book playback.
- [ ] End voice stops microphone use and releases the browser indicator. It
      leaves narration stopped when the conversation began from a stopped book.
- [ ] Starting narration or selecting another passage ends an active voice
      session; the model is never left listening during book narration.

## Failure recovery

- [ ] Without an OpenAI key, browser narration and manual reading remain usable.
- [ ] A malformed or non-PDF upload produces a clear error and leaves the
      current book usable.
- [ ] A narration error leaves manual navigation available.
- [ ] Reloading after an error restores a valid reader state.

## Result template

```text
Date:
Commit:
Browser and version:
Operating system:
Browser narration: PASS / FAIL / NOT RUN
OpenAI narration: PASS / FAIL / NOT RUN
Companion: PASS / FAIL / NOT RUN
Live voice: PASS / FAIL / NOT RUN
Notes:
```
