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
- [ ] Continue restores the exact sentence, page, and chapter.
- [ ] Start here dismisses the saved position and keeps the opening passage.
- [ ] Asking about the selected passage returns an answer grounded in nearby
      book text.
- [ ] The answer cites a physical PDF page when useful.
- [ ] A question outside the supplied context is not attributed to the book.

## First session and live voice

- [ ] A new one-book session introduces the extracted title and author.
- [ ] A detected preface can be chosen, while Begin reading starts at the first
      eligible main-text passage.
- [ ] Start talking stops narration before requesting microphone access.
- [ ] The voice companion greets the reader and answers about the visible
      passage without inventing unsupported book details.
- [ ] Speaking while the companion responds interrupts it cleanly.
- [ ] Mute disables input and Unmute restores it.
- [ ] Completed user and companion transcripts appear in recent memory, remain
      bounded, and can be cleared.
- [ ] End stops microphone use, releases the browser indicator, and does not
      resume narration.
- [ ] Starting narration or selecting another passage ends an active voice
      session so its context cannot become stale.

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
