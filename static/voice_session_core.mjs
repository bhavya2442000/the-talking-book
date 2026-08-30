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

export function completedReaderAction(event) {
  if (event?.type !== "response.done" || event.response?.status !== "completed") {
    return null;
  }
  const call = event.response.output?.find(
    (item) => item?.type === "function_call"
      && item.status === "completed"
      && item.name === "control_reader",
  );
  if (!call?.call_id) return null;
  try {
    const argumentsValue = JSON.parse(call.arguments || "{}");
    if (
      !argumentsValue
      || Array.isArray(argumentsValue)
      || typeof argumentsValue !== "object"
      || Object.keys(argumentsValue).some(
        (key) => !["action", "scope"].includes(key),
      )
    ) return null;
    const supported = (
      argumentsValue.action === "continue"
        && argumentsValue.scope === "current_position"
    ) || (
      argumentsValue.action === "repeat"
        && argumentsValue.scope === "paragraph"
    );
    if (!supported) return null;
    return {
      action: argumentsValue.action,
      scope: argumentsValue.scope,
      callId: call.call_id,
    };
  } catch {
    return null;
  }
}

export function completedWelcomeAction(event, availableBookIds = []) {
  if (event?.type !== "response.done" || event.response?.status !== "completed") {
    return null;
  }
  const call = event.response.output?.find(
    (item) => item?.type === "function_call"
      && item.status === "completed"
      && item.name === "welcome_reader",
  );
  if (!call?.call_id) return null;
  try {
    const value = JSON.parse(call.arguments || "{}");
    if (
      !value
      || Array.isArray(value)
      || typeof value !== "object"
      || Object.keys(value).some(
        (key) => !["action", "book_id", "start"].includes(key),
      )
      || !availableBookIds.includes(value.book_id)
    ) return null;
    const supported = (
      value.action === "select_book" && value.start === "none"
    ) || (
      value.action === "start_reading"
        && ["recommended", "main"].includes(value.start)
    );
    if (!supported) return null;
    return {
      action: value.action,
      bookId: value.book_id,
      start: value.start,
      callId: call.call_id,
    };
  } catch {
    return null;
  }
}

export function welcomeOpeningDecisionEvents(hasOpeningChoice) {
  return {
    requireDecision: {
      type: "session.update",
      session: {
        type: "realtime",
        tool_choice: "required",
      },
    },
    askQuestion: {
      type: "response.create",
      response: {
        tool_choice: "none",
        instructions: hasOpeningChoice
          ? "Ask one short question using the latest tool result: recommended opening or main text. Do not explain the book or either choice."
          : "Ask one short confirmation question using the latest tool result: should reading begin at the available main-text start? Do not explain the book."
      },
    },
  };
}

export function shouldResumeAfterVoice(playbackStatus) {
  return ["loading", "playing"].includes(playbackStatus);
}

export function shouldPauseNarrationForVoiceStart(persistent) {
  return !persistent;
}

export function shouldKeepVoiceForPlayback(persistent) {
  return Boolean(persistent);
}

export function shouldInterruptNarration(persistent, playbackStatus) {
  return Boolean(persistent && ["loading", "playing"].includes(playbackStatus));
}

export function shouldCreateInitialVoiceResponse(_persistent, welcome = false) {
  return Boolean(welcome);
}
