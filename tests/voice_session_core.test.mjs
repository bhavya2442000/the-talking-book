import assert from "node:assert/strict";
import test from "node:test";

import {
  VOICE_STATES,
  appendVoiceTurn,
  completedVoiceTurn,
  sanitizeVoiceTurns,
  transitionVoiceState,
  voiceMemoryKey,
} from "../static/voice_session_core.mjs";

test("voice lifecycle follows explicit start, mute, stop, and retry states", () => {
  let state = VOICE_STATES.DISCONNECTED;
  state = transitionVoiceState(state, "START");
  assert.equal(state, VOICE_STATES.REQUESTING);
  state = transitionVoiceState(state, "PERMISSION_GRANTED");
  assert.equal(state, VOICE_STATES.CONNECTING);
  state = transitionVoiceState(state, "CONNECTED");
  assert.equal(state, VOICE_STATES.LISTENING);
  state = transitionVoiceState(state, "MUTE");
  assert.equal(state, VOICE_STATES.MUTED);
  state = transitionVoiceState(state, "UNMUTE");
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
