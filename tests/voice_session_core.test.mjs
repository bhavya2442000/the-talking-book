import assert from "node:assert/strict";
import test from "node:test";

import {
  VOICE_STATES,
  appendVoiceTurn,
  completedReaderAction,
  completedWelcomeAction,
  completedVoiceTurn,
  sanitizeVoiceTurns,
  shouldCreateInitialVoiceResponse,
  shouldResumeAfterVoice,
  transitionVoiceState,
  voiceMemoryKey,
  welcomeOpeningDecisionEvents,
} from "../static/voice_session_core.mjs";

test("on-demand voice waits silently for the reader while welcome speaks first", () => {
  assert.equal(shouldCreateInitialVoiceResponse(false), false);
  assert.equal(shouldCreateInitialVoiceResponse(true), true);
});

test("welcome tool accepts only real books and valid two-stage choices", () => {
  const event = (argumentsValue) => ({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "welcome_reader",
        call_id: "welcome-1",
        arguments: JSON.stringify(argumentsValue),
      }],
    },
  });

  assert.deepEqual(completedWelcomeAction(event({
    action: "select_book",
    book_id: "book-a",
    start: "none",
  }), ["book-a", "book-b"]), {
    action: "select_book",
    bookId: "book-a",
    start: "none",
    callId: "welcome-1",
  });
  assert.deepEqual(completedWelcomeAction(event({
    action: "start_reading",
    book_id: "book-b",
    start: "recommended",
  }), ["book-a", "book-b"]), {
    action: "start_reading",
    bookId: "book-b",
    start: "recommended",
    callId: "welcome-1",
  });
  assert.equal(completedWelcomeAction(event({
    action: "select_book",
    book_id: "invented-book",
    start: "none",
  }), ["book-a"]), null);
  assert.equal(completedWelcomeAction(event({
    action: "select_book",
    book_id: "book-a",
    start: "main",
  }), ["book-a"]), null);
  assert.equal(completedWelcomeAction(event({
    action: "start_reading",
    book_id: "book-a",
    start: "none",
  }), ["book-a"]), null);
});

test("welcome asks the opening question in speech then requires a start action", () => {
  const withChoice = welcomeOpeningDecisionEvents(true);
  assert.equal(withChoice.requireDecision.session.tool_choice, "required");
  assert.equal(withChoice.askQuestion.response.tool_choice, "none");
  assert.match(withChoice.askQuestion.response.instructions, /Do not explain/);
  assert.match(withChoice.askQuestion.response.instructions, /recommended opening or main text/);

  const directStart = welcomeOpeningDecisionEvents(false);
  assert.equal(directStart.requireDecision.session.tool_choice, "required");
  assert.equal(directStart.askQuestion.response.tool_choice, "none");
  assert.match(directStart.askQuestion.response.instructions, /confirmation question/);
});

test("one reader-control contract validates supported model plans", () => {
  const action = completedReaderAction({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "control_reader",
        call_id: "call-42",
        arguments: JSON.stringify({ action: "continue", scope: "current_position" }),
      }],
    },
  });

  assert.deepEqual(action, {
    action: "continue",
    scope: "current_position",
    callId: "call-42",
  });
  assert.deepEqual(completedReaderAction({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "control_reader",
        call_id: "call-repeat",
        arguments: JSON.stringify({ action: "repeat", scope: "paragraph" }),
      }],
    },
  }), { action: "repeat", scope: "paragraph", callId: "call-repeat" });
  assert.equal(completedReaderAction({ type: "response.done", response: {} }), null);
  assert.equal(completedReaderAction({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "skip_a_chapter",
        call_id: "call-43",
        arguments: "{}",
      }],
    },
  }), null);
  assert.equal(completedReaderAction({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "control_reader",
        call_id: "call-44",
        arguments: "{not-json}",
      }],
    },
  }), null);
  assert.equal(completedReaderAction({
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "control_reader",
        call_id: "call-invalid-combination",
        arguments: JSON.stringify({ action: "continue", scope: "paragraph" }),
      }],
    },
  }), null);
});

test("voice lifecycle follows explicit start, stop, and retry states", () => {
  let state = VOICE_STATES.DISCONNECTED;
  state = transitionVoiceState(state, "START");
  assert.equal(state, VOICE_STATES.REQUESTING);
  state = transitionVoiceState(state, "PERMISSION_GRANTED");
  assert.equal(state, VOICE_STATES.CONNECTING);
  state = transitionVoiceState(state, "CONNECTED");
  assert.equal(state, VOICE_STATES.LISTENING);
  state = transitionVoiceState(state, "STOP");
  assert.equal(state, VOICE_STATES.STOPPING);
  assert.equal(transitionVoiceState(state, "STOPPED"), VOICE_STATES.DISCONNECTED);
});

test("invalid lifecycle events cannot skip microphone permission or connection", () => {
  assert.equal(
    transitionVoiceState(VOICE_STATES.DISCONNECTED, "CONNECTED"),
    VOICE_STATES.DISCONNECTED,
  );
  assert.equal(
    transitionVoiceState(VOICE_STATES.REQUESTING, "CONNECTED"),
    VOICE_STATES.REQUESTING,
  );
  assert.equal(
    transitionVoiceState(VOICE_STATES.ERROR, "START"),
    VOICE_STATES.REQUESTING,
  );
  assert.equal(
    transitionVoiceState(VOICE_STATES.DISCONNECTED, "FAIL"),
    VOICE_STATES.ERROR,
  );
});

test("voice memory is sanitized, truncated, and scoped by book", () => {
  const turns = Array.from({ length: 14 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    text: ` turn ${index} `,
  }));
  turns.push({ role: "system", text: "ignore me" });
  turns.push({ role: "user", text: "x".repeat(600) });
  const sanitized = sanitizeVoiceTurns(turns);

  assert.equal(sanitized.length, 12);
  assert.equal(sanitized.at(-1).text.length, 500);
  assert.equal(sanitized.some((turn) => turn.role === "system"), false);
  assert.equal(voiceMemoryKey("book-42"), "talking-book:voice-memory:book-42");
});

test("completed transcript events become bounded memory turns", () => {
  const user = completedVoiceTurn({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: " What does this mean? ",
  });
  const assistant = completedVoiceTurn({
    type: "response.output_audio_transcript.done",
    transcript: "It means the narrator has changed their mind.",
  });
  let memory = appendVoiceTurn([], user);
  memory = appendVoiceTurn(memory, assistant);

  assert.deepEqual(memory, [
    { role: "user", text: "What does this mean?" },
    { role: "assistant", text: "It means the narrator has changed their mind." },
  ]);
  assert.equal(completedVoiceTurn({ type: "response.done" }), null);
});

test("voice conversation resumes only narration that it interrupted", () => {
  assert.equal(shouldResumeAfterVoice("playing"), true);
  assert.equal(shouldResumeAfterVoice("loading"), true);
  assert.equal(shouldResumeAfterVoice("paused"), false);
  assert.equal(shouldResumeAfterVoice("stopped"), false);
  assert.equal(shouldResumeAfterVoice("error"), false);
});
