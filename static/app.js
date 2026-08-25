import {
  chapterProgressPercent,
  clampSegmentIndex,
  isCurrentPlaybackToken,
  isValidSegmentIndex,
  paragraphStartSegment,
  upcomingSegmentIndices,
} from "./playback_core.mjs?v=2";

const state = {
  config: null,
  library: [],
  book: null,
  sectionIndex: null,
  segmentIndex: 0,
  status: "stopped",
  token: 0,
  utterance: null,
  audio: null,
  audioCache: new Map(),
  audioRequests: new Map(),
  resumeSegmentIndex: null,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  emptyState: $("#emptyState"),
  appShell: $("#appShell"),
  player: $("#player"),
  uploadForm: $("#uploadForm"),
  pdfInput: $("#pdfInput"),
  uploadStatus: $("#uploadStatus"),
  bookSelect: $("#bookSelect"),
  bookAuthor: $("#bookAuthor"),
  bookStats: $("#bookStats"),
  toc: $("#toc"),
  sectionTitle: $("#sectionTitle"),
  sectionKicker: $("#sectionKicker"),
  pageBadge: $("#pageBadge"),
  reader: $("#reader"),
  currentText: $("#currentText"),
  playerText: $("#playerText"),
  playerSection: $("#playerSection"),
  playbackStatus: $("#playbackStatus"),
  progressBar: $("#progressBar"),
  progressText: $("#progressText"),
  playButton: $("#playButton"),
  pauseButton: $("#pauseButton"),
  previousButton: $("#previousButton"),
  nextButton: $("#nextButton"),
  repeatParagraphButton: $("#repeatParagraphButton"),
  rate: $("#rate"),
  rateValue: $("#rateValue"),
  questionForm: $("#questionForm"),
  question: $("#question"),
  askButton: $("#askButton"),
  answer: $("#answer"),
  apiNotice: $("#apiNotice"),
  cloudVoiceLabel: $("#cloudVoiceLabel"),
  cloudVoice: $("#cloudVoice"),
  resumePrompt: $("#resumePrompt"),
  resumeText: $("#resumeText"),
  continueResume: $("#continueResume"),
  dismissResume: $("#dismissResume"),
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(body?.detail || body || `Request failed (${response.status})`);
  }
  return body;
}

function sectionForSegment(segment) {
  if (segment?.section == null) return null;
  return state.book.sections[segment.section];
}

function chapterSections(book) {
  return book.sections.filter((section) => section.segment_start != null);
}

function firstReadableSegment(section) {
  const paragraph = state.book.paragraphs.find((candidate) =>
    candidate.section === section.index
    && candidate.text.length >= 110
    && candidate.segment_start >= 0
  );
  return paragraph?.segment_start ?? section.segment_start;
}

function sessionKey(bookId) {
  return `talking-book:session:${bookId}`;
}

function readSavedSession(bookId) {
  try {
    return JSON.parse(localStorage.getItem(sessionKey(bookId))) || null;
  } catch {
    return null;
  }
}

function saveSession() {
  if (!state.book) return;
  try {
    localStorage.setItem(sessionKey(state.book.id), JSON.stringify({
      segmentIndex: state.segmentIndex,
      rate: Number(elements.rate.value),
      cloudVoice: Boolean(elements.cloudVoice.checked),
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Reading must remain usable when storage is unavailable or full.
  }
}

function applySavedSettings(saved) {
  const rate = Number(saved?.rate);
  if (Number.isFinite(rate) && rate >= 0.7 && rate <= 1.6) {
    elements.rate.value = String(rate);
  }
  elements.rateValue.textContent = `${Number(elements.rate.value).toFixed(1).replace(".0", "")}×`;
  elements.cloudVoice.checked = Boolean(
    state.config.openai_configured && saved?.cloudVoice
  );
}

async function initialize() {
  try {
    [state.config, state.library] = await Promise.all([api("/api/config"), api("/api/books")]);
    elements.apiNotice.hidden = state.config.openai_configured;
    elements.cloudVoiceLabel.hidden = !state.config.openai_configured;
    renderLibrary();
    if (state.library.length) {
      await loadBook(state.library[0].id);
    } else {
      elements.emptyState.hidden = false;
    }
  } catch (error) {
    elements.emptyState.hidden = false;
    elements.uploadStatus.textContent = error.message;
  }
}

function renderLibrary() {
  elements.bookSelect.innerHTML = "";
  for (const book of state.library) {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    elements.bookSelect.append(option);
  }
}

async function loadBook(bookId) {
  stopPlayback();
  clearAudioQueue();
  elements.uploadStatus.textContent = "Loading book…";
  state.book = await api(`/api/books/${bookId}`);
  const saved = readSavedSession(bookId);
  applySavedSettings(saved);
  elements.bookSelect.value = bookId;
  elements.bookAuthor.textContent = state.book.author || "Unknown author";
  elements.bookStats.textContent = `${state.book.page_count} PDF pages · ${state.book.word_count.toLocaleString()} words`;
  elements.emptyState.hidden = true;
  elements.appShell.hidden = false;
  elements.player.hidden = false;
  renderToc();
  const preferred = state.book.sections.find((section) => section.level === 1 && section.segment_start != null)
    || chapterSections(state.book)[0];
  const startingIndex = preferred ? firstReadableSegment(preferred) : 0;
  if (preferred) selectSegment(startingIndex, { scroll: false, persist: false });

  const savedIndex = Number(saved?.segmentIndex);
  const canResume = isValidSegmentIndex(savedIndex, state.book.segments.length)
    && savedIndex !== startingIndex;
  state.resumeSegmentIndex = canResume ? savedIndex : null;
  elements.resumePrompt.hidden = !canResume;
  if (canResume) {
    const savedSegment = state.book.segments[savedIndex];
    const savedSection = sectionForSegment(savedSegment);
    elements.resumeText.textContent = `${savedSection?.title || "Saved passage"} · PDF page ${savedSegment.page}`;
  }
  elements.uploadStatus.textContent = "";
}

function renderToc() {
  elements.toc.innerHTML = "";
  for (const section of chapterSections(state.book)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-${Math.min(section.level, 1)}`;
    button.dataset.section = section.index;
    button.textContent = section.title;
    button.addEventListener("click", () => selectSegment(firstReadableSegment(section)));
    elements.toc.append(button);
  }
}

function renderSection(sectionIndex) {
  const section = state.book.sections[sectionIndex];
  state.sectionIndex = sectionIndex;
  elements.sectionTitle.textContent = section.title;
  elements.sectionKicker.textContent = section.level === 0 ? "Book section" : "Now reading";
  elements.reader.innerHTML = "";

  const paragraphs = state.book.paragraphs.filter((paragraph) => paragraph.section === sectionIndex);
  for (const paragraph of paragraphs) {
    const node = document.createElement("p");
    node.className = "paragraph";
    const segmentCount = paragraph.segment_end - paragraph.segment_start + 1;
    if (paragraph.text.length < 100 && segmentCount <= 1) node.classList.add("heading");

    for (let index = paragraph.segment_start; index <= paragraph.segment_end; index += 1) {
      const segment = state.book.segments[index];
      const span = document.createElement("span");
      span.className = "segment";
      span.dataset.segment = index;
      span.textContent = `${segment.text}${index < paragraph.segment_end ? " " : ""}`;
      span.tabIndex = 0;
      span.addEventListener("click", () => {
        stopPlayback(false);
        selectSegment(index);
      });
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          stopPlayback(false);
          selectSegment(index);
        }
      });
      node.append(span);
    }
    elements.reader.append(node);
  }

  elements.toc.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.section) === sectionIndex);
  });
}

function selectSegment(index, { scroll = true, persist = true } = {}) {
  if (!state.book || index < 0 || index >= state.book.segments.length) return;
  state.segmentIndex = index;
  const segment = state.book.segments[index];
  const section = sectionForSegment(segment);
  if (section && state.sectionIndex !== section.index) renderSection(section.index);
  elements.reader.querySelectorAll(".segment.current").forEach((node) => node.classList.remove("current"));
  const active = elements.reader.querySelector(`[data-segment="${index}"]`);
  active?.classList.add("current");
  if (scroll) active?.scrollIntoView({ block: "center", behavior: "smooth" });
  elements.currentText.textContent = segment.text;
  elements.playerText.textContent = segment.text;
  elements.playerSection.textContent = section?.title || state.book.title;
  elements.pageBadge.textContent = `PDF page ${segment.page}`;
  elements.answer.textContent = "";
  updateChapterProgress();
  updateTransport();
  if (persist) saveSession();
}

function updateChapterProgress() {
  const segment = state.book?.segments[state.segmentIndex];
  const section = sectionForSegment(segment);
  if (!section || section.segment_start == null || section.segment_end == null) {
    elements.progressBar.style.width = "0%";
    elements.progressText.textContent = "0%";
    return;
  }
  const percent = chapterProgressPercent(
    state.segmentIndex,
    section.segment_start,
    section.segment_end,
  );
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${percent}% of chapter`;
}

function cancelOutputs(invalidate = true) {
  if (invalidate) state.token += 1;
  window.speechSynthesis?.cancel();
  if (state.audio) {
    state.audio.pause();
    state.audio.onended = null;
    state.audio.onerror = null;
    state.audio.src = "";
  }
  state.audio = null;
  state.utterance = null;
}

function clearAudioQueue() {
  for (const request of state.audioRequests.values()) request.controller.abort();
  state.audioRequests.clear();
  for (const url of state.audioCache.values()) URL.revokeObjectURL(url);
  state.audioCache.clear();
}

function rememberAudio(index, url) {
  if (state.audioCache.has(index)) URL.revokeObjectURL(state.audioCache.get(index));
  state.audioCache.set(index, url);
  while (state.audioCache.size > 12) {
    const oldest = state.audioCache.keys().next().value;
    if (oldest === state.segmentIndex) {
      const currentUrl = state.audioCache.get(oldest);
      state.audioCache.delete(oldest);
      state.audioCache.set(oldest, currentUrl);
      continue;
    }
    URL.revokeObjectURL(state.audioCache.get(oldest));
    state.audioCache.delete(oldest);
  }
}

async function getCloudAudio(index) {
  if (state.audioCache.has(index)) {
    const cached = state.audioCache.get(index);
    state.audioCache.delete(index);
    state.audioCache.set(index, cached);
    return cached;
  }
  if (state.audioRequests.has(index)) return state.audioRequests.get(index).promise;

  const controller = new AbortController();
  const promise = (async () => {
    const response = await fetch(`/api/books/${state.book.id}/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_index: index, voice: "alloy" }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Cloud narration failed");
    }
    const url = URL.createObjectURL(await response.blob());
    rememberAudio(index, url);
    return url;
  })();

  state.audioRequests.set(index, { promise, controller });
  try {
    return await promise;
  } finally {
    state.audioRequests.delete(index);
  }
}

function usingCloudVoice() {
  return Boolean(state.config?.openai_configured && elements.cloudVoice.checked);
}

function prefetchUpcoming(index) {
  if (!usingCloudVoice() || !state.book) return;
  for (const nextIndex of upcomingSegmentIndices(index, state.book.segments.length, 2)) {
    getCloudAudio(nextIndex).catch((error) => {
      if (error.name !== "AbortError") console.warn("Narration prefetch failed", error);
    });
  }
}

function stopPlayback(invalidate = true) {
  cancelOutputs(invalidate);
  setPlaybackStatus("stopped");
}

function setPlaybackStatus(status, label) {
  state.status = status;
  const labels = {
    stopped: "Ready",
    loading: "Loading",
    playing: "Playing",
    paused: "Paused",
    error: "Error",
  };
  elements.playbackStatus.textContent = label || labels[status] || status;
  elements.playbackStatus.dataset.state = status;
  updateTransport();
}

function updateTransport() {
  elements.playButton.textContent = state.status === "playing" ? "●" : state.status === "loading" ? "…" : "▶";
  elements.playButton.title = state.status === "paused" ? "Continue" : "Play";
  elements.pauseButton.disabled = !["loading", "playing"].includes(state.status);
  elements.previousButton.disabled = !state.book || state.segmentIndex <= 0;
  elements.nextButton.disabled = !state.book || state.segmentIndex >= state.book.segments.length - 1;
}

async function speakCurrent() {
  if (!state.book) return;
  const segment = state.book.segments[state.segmentIndex];
  if (!segment) return;
  cancelOutputs(true);
  selectSegment(state.segmentIndex);
  const token = state.token;

  const finished = () => {
    if (!isCurrentPlaybackToken(token, state.token) || state.status !== "playing") return;
    if (state.segmentIndex + 1 >= state.book.segments.length) {
      setPlaybackStatus("stopped", "Finished");
      return;
    }
    state.segmentIndex += 1;
    speakCurrent();
  };

  if (usingCloudVoice()) {
    setPlaybackStatus("loading");
    try {
      const audioUrl = await getCloudAudio(state.segmentIndex);
      if (!isCurrentPlaybackToken(token, state.token) || state.status === "paused") return;
      state.audio = new Audio(audioUrl);
      state.audio.playbackRate = Number(elements.rate.value);
      state.audio.onended = finished;
      state.audio.onerror = () => {
        if (isCurrentPlaybackToken(token, state.token)) {
          setPlaybackStatus("error", "Audio error");
        }
      };
      await state.audio.play();
      if (!isCurrentPlaybackToken(token, state.token)) return;
      setPlaybackStatus("playing");
      prefetchUpcoming(state.segmentIndex);
    } catch (error) {
      if (error.name !== "AbortError" && isCurrentPlaybackToken(token, state.token)) {
        elements.uploadStatus.textContent = error.message;
        setPlaybackStatus("error", "Narration failed");
      }
    }
    return;
  }

  if (!("speechSynthesis" in window)) {
    elements.uploadStatus.textContent = "This browser does not support built-in narration.";
    setPlaybackStatus("error", "Voice unavailable");
    return;
  }
  setPlaybackStatus("playing");
  const utterance = new SpeechSynthesisUtterance(segment.text);
  utterance.rate = Number(elements.rate.value);
  utterance.onend = finished;
  utterance.onerror = (event) => {
    if (event.error !== "canceled" && isCurrentPlaybackToken(token, state.token)) {
      elements.uploadStatus.textContent = `Narration error: ${event.error}`;
      setPlaybackStatus("error", "Narration failed");
    }
  };
  state.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function playOrContinue() {
  if (state.status === "paused") {
    if (state.audio) {
      state.audio.play()
        .then(() => setPlaybackStatus("playing"))
        .catch(() => setPlaybackStatus("error", "Could not continue"));
    } else if (window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
      setPlaybackStatus("playing");
    } else {
      speakCurrent();
    }
    return;
  }
  if (!["playing", "loading"].includes(state.status)) speakCurrent();
}

function pausePlayback() {
  if (!["playing", "loading"].includes(state.status)) return;
  if (state.audio) state.audio.pause();
  else window.speechSynthesis?.pause();
  setPlaybackStatus("paused");
}

function moveBySentence(offset) {
  if (!state.book) return;
  const target = clampSegmentIndex(state.segmentIndex + offset, state.book.segments.length);
  if (target === state.segmentIndex) return;
  const wasActive = ["playing", "loading"].includes(state.status);
  const wasPaused = state.status === "paused";
  cancelOutputs(true);
  selectSegment(target);
  setPlaybackStatus(wasPaused ? "paused" : "stopped");
  if (wasActive) speakCurrent();
}

function repeatParagraph() {
  if (!state.book) return;
  const segment = state.book.segments[state.segmentIndex];
  const start = paragraphStartSegment(segment, state.book.paragraphs, state.segmentIndex);
  selectSegment(start);
  speakCurrent();
}

function continueSavedSession() {
  if (state.resumeSegmentIndex == null) return;
  const target = state.resumeSegmentIndex;
  state.resumeSegmentIndex = null;
  elements.resumePrompt.hidden = true;
  selectSegment(target);
  setPlaybackStatus("stopped", "Position restored");
}

function dismissSavedSession() {
  state.resumeSegmentIndex = null;
  elements.resumePrompt.hidden = true;
  saveSession();
}

async function uploadSelectedFile() {
  const file = elements.pdfInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  elements.uploadStatus.textContent = "Uploading and extracting… this can take about a minute.";
  try {
    const book = await api("/api/books", { method: "POST", body: formData });
    state.library = await api("/api/books");
    renderLibrary();
    await loadBook(book.id);
  } catch (error) {
    elements.uploadStatus.textContent = error.message;
  } finally {
    elements.pdfInput.value = "";
  }
}

async function askQuestion(event) {
  event.preventDefault();
  if (!state.book) return;
  const question = elements.question.value.trim() || "Explain this passage in clear, simple language.";
  elements.askButton.disabled = true;
  elements.answer.className = "answer loading";
  elements.answer.textContent = "Thinking about the current passage…";
  try {
    const result = await api(`/api/books/${state.book.id}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_index: state.segmentIndex, question }),
    });
    elements.answer.className = "answer";
    elements.answer.textContent = result.answer;
  } catch (error) {
    elements.answer.className = "answer";
    elements.answer.textContent = error.message;
  } finally {
    elements.askButton.disabled = false;
  }
}

elements.pdfInput.addEventListener("change", uploadSelectedFile);
elements.bookSelect.addEventListener("change", (event) => loadBook(event.target.value));
elements.playButton.addEventListener("click", playOrContinue);
elements.pauseButton.addEventListener("click", pausePlayback);
elements.previousButton.addEventListener("click", () => moveBySentence(-1));
elements.nextButton.addEventListener("click", () => moveBySentence(1));
elements.repeatParagraphButton.addEventListener("click", repeatParagraph);
elements.continueResume.addEventListener("click", continueSavedSession);
elements.dismissResume.addEventListener("click", dismissSavedSession);
elements.rate.addEventListener("input", () => {
  elements.rateValue.textContent = `${Number(elements.rate.value).toFixed(1).replace(".0", "")}×`;
  if (state.audio) state.audio.playbackRate = Number(elements.rate.value);
  saveSession();
});
elements.cloudVoice.addEventListener("change", () => {
  const wasActive = ["loading", "playing"].includes(state.status);
  clearAudioQueue();
  saveSession();
  if (wasActive) speakCurrent();
});
elements.questionForm.addEventListener("submit", askQuestion);
window.addEventListener("beforeunload", () => {
  saveSession();
  cancelOutputs(true);
  clearAudioQueue();
});

initialize();
