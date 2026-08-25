export const VOICE_STATES = Object.freeze({
  DISCONNECTED: "disconnected",
  REQUESTING: "requesting",
  CONNECTING: "connecting",
  LISTENING: "listening",
  MUTED: "muted",
  STOPPING: "stopping",
  ERROR: "error",
});

const transitions = {
  disconnected: { START: "requesting", FAIL: "error" },
  requesting: { PERMISSION_GRANTED: "connecting", STOP: "stopping", FAIL: "error" },
  connecting: { CONNECTED: "listening", STOP: "stopping", FAIL: "error" },
  listening: { MUTE: "muted", STOP: "stopping", FAIL: "error" },
  muted: { UNMUTE: "listening", STOP: "stopping", FAIL: "error" },
  stopping: { STOPPED: "disconnected", FAIL: "error" },
  error: { START: "requesting", STOP: "stopping", STOPPED: "disconnected" },
};

export function transitionVoiceState(current, event) {
  return transitions[current]?.[event] || current;
}

export function voiceMemoryKey(bookId) {
  return `talking-book:voice-memory:${bookId}`;
}

export function sanitizeVoiceTurns(turns, maxTurns = 12) {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((turn) => turn && ["user", "assistant"].includes(turn.role))
    .map((turn) => ({
      role: turn.role,
      text: String(turn.text || "").trim().slice(0, 500),
    }))
    .filter((turn) => turn.text)
    .slice(-maxTurns);
}

export function appendVoiceTurn(turns, turn, maxTurns = 12) {
  return sanitizeVoiceTurns([...(Array.isArray(turns) ? turns : []), turn], maxTurns);
}

export function completedVoiceTurn(event) {
  if (event?.type === "conversation.item.input_audio_transcription.completed") {
    return { role: "user", text: String(event.transcript || "").trim() };
  }
  if (event?.type === "response.output_audio_transcript.done") {
    return { role: "assistant", text: String(event.transcript || "").trim() };
  }
  return null;
}
