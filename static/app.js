import {
  adjacentNarrationSegmentIndex,
  chapterTransitionAfter,
  chapterProgressPercent,
  isCurrentPlaybackToken,
  isNarrationEligible,
  isValidSegmentIndex,
  libraryEntryDecision,
  paragraphStartSegment,
  bookOpeningChoice,
  readingOrderSegmentIndex,
  readerSessionMode,
  returningReaderPosition,
  savedPositionPrecedesOpening,
  upcomingNarrationSegmentIndices,
} from "./playback_core.mjs?v=7";
import {
  VOICE_STATES,
  appendVoiceTurn,
  completedReaderAction,
  completedWelcomeAction,
  completedVoiceTurn,
  sanitizeVoiceTurns,
  shouldCreateInitialVoiceResponse,
  shouldInterruptNarration,
  shouldKeepVoiceForPlayback,
  shouldPauseNarrationForVoiceStart,
  shouldResumeAfterVoice,
  transitionVoiceState,
  voiceMemoryKey,
  welcomeOpeningDecisionEvents,
} from "./voice_session_core.mjs?v=9";
import {
  annotationAppliesToSegment,
  annotationStorageKey,
  completedAnnotationAction,
  createAnchoredAnnotation,
  sanitizeAnnotations,
} from "./annotation_core.mjs?v=1";

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
  openingChoice: null,
  annotations: [],
  welcomeStage: null,
  sessionMode: readerSessionMode(window.location.search),
  voice: {
    status: VOICE_STATES.DISCONNECTED,
    message: "Ask by voice when you want to pause at this sentence.",
    token: 0,
    peerConnection: null,
    dataChannel: null,
    mediaStream: null,
    memory: [],
    resumeNarration: false,
    persistent: false,
    welcome: false,
    contextParagraph: null,
    responseActive: false,
    companionAudioPlaying: false,
  },
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
  reindexBook: $("#reindexBook"),
  sessionTestControls: $("#sessionTestControls"),
  newReaderTest: $("#newReaderTest"),
  returningReaderTest: $("#returningReaderTest"),
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
  resumeRecap: $("#resumeRecap"),
  recapResume: $("#recapResume"),
  continueResume: $("#continueResume"),
  dismissResume: $("#dismissResume"),
  chapterTransition: $("#chapterTransition"),
  chapterCompleteTitle: $("#chapterCompleteTitle"),
  chapterNextText: $("#chapterNextText"),
  stayAtChapter: $("#stayAtChapter"),
  continueChapter: $("#continueChapter"),
  startPrompt: $("#startPrompt"),
  startTitle: $("#startTitle"),
  startText: $("#startText"),
  readPreface: $("#readPreface"),
  beginBook: $("#beginBook"),
  libraryWelcome: $("#libraryWelcome"),
  libraryWelcomeText: $("#libraryWelcomeText"),
  welcomeBookChoices: $("#welcomeBookChoices"),
  voiceStatus: $("#voiceStatus"),
  voiceMessage: $("#voiceMessage"),
  startVoiceButton: $("#startVoiceButton"),
  clearVoiceMemoryButton: $("#clearVoiceMemoryButton"),
  voiceTranscript: $("#voiceTranscript"),
  assistantAudio: $("#assistantAudio"),
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
  return book.sections.filter((section) =>
    section.segment_start != null && section.narration_eligible !== false
  );
}

function firstReadableSegment(section) {
  const paragraph = state.book.paragraphs.find((candidate) =>
    candidate.section === section.index
    && candidate.narration_eligible !== false
    && candidate.text.length >= 110
    && candidate.segment_start >= 0
  );
  return paragraph?.segment_start ?? section.segment_start;
}

function startSegment(kind = "main_text_segment") {
  const candidate = readingOrderSegmentIndex(state.book, kind);
  if (!isValidSegmentIndex(candidate, state.book?.segments.length)) return 0;
  const section = sectionForSegment(state.book.segments[candidate]);
  return section ? firstReadableSegment(section) : candidate;
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

function updateSavedSessionCursor(bookId, segmentIndex) {
  const saved = readSavedSession(bookId);
  if (!saved) return;
  try {
    localStorage.setItem(sessionKey(bookId), JSON.stringify({
      ...saved,
      segmentIndex,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Re-analysis remains usable when storage is unavailable or full.
  }
}

function saveSession() {
  if (!state.book) return;
  try {
    localStorage.setItem(sessionKey(state.book.id), JSON.stringify({
      segmentIndex: state.segmentIndex,
      rate: Number(elements.rate.value),
      cloudVoice: Boolean(elements.cloudVoice.checked),
      started: true,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Reading must remain usable when storage is unavailable or full.
  }
}

function loadAnnotations(bookId) {
  try {
    const saved = JSON.parse(localStorage.getItem(annotationStorageKey(bookId))) || [];
    state.annotations = sanitizeAnnotations(saved, state.book);
  } catch {
    state.annotations = [];
  }
  saveAnnotations();
}

function saveAnnotations() {
  if (!state.book) return;
  try {
    localStorage.setItem(
      annotationStorageKey(state.book.id),
      JSON.stringify(state.annotations),
    );
  } catch {
    // Reading and voice controls remain available if browser storage is full.
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

function renderSessionTestControls() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  elements.sessionTestControls.hidden = !isLocal;
  if (!isLocal) return;
  elements.newReaderTest.classList.toggle("active", state.sessionMode === "new");
  elements.returningReaderTest.classList.toggle(
    "active",
    state.sessionMode === "returning",
  );
}

async function initialize() {
  try {
    [state.config, state.library] = await Promise.all([api("/api/config"), api("/api/books")]);
    elements.apiNotice.hidden = state.config.openai_configured;
    elements.cloudVoiceLabel.hidden = !state.config.openai_configured;
    renderSessionTestControls();
    renderLibrary();
    if (state.library.length) {
      const savedSessions = Object.fromEntries(
        state.library.map((book) => [book.id, readSavedSession(book.id)]),
      );
      const entry = libraryEntryDecision(state.library, savedSessions, state.sessionMode);
      if (entry.kind === "choose_book") {
        renderLibraryWelcome();
      } else {
        await loadBook(entry.bookId);
      }
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
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a book";
  placeholder.disabled = true;
  elements.bookSelect.append(placeholder);
  for (const book of state.library) {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    elements.bookSelect.append(option);
  }
}

function renderLibraryWelcome() {
  stopVoiceSession();
  stopPlayback();
  state.book = null;
  state.sectionIndex = null;
  state.welcomeStage = "choose_book";
  elements.emptyState.hidden = true;
  elements.appShell.hidden = false;
  elements.player.hidden = false;
  elements.libraryWelcome.hidden = false;
  elements.startPrompt.hidden = true;
  elements.resumePrompt.hidden = true;
  elements.chapterTransition.hidden = true;
  elements.bookSelect.value = "";
  elements.bookAuthor.textContent = "First-time reader";
  elements.bookStats.textContent = `${state.library.length} books ready`;
  elements.toc.replaceChildren();
  elements.reader.replaceChildren();
  elements.sectionKicker.textContent = "Welcome";
  elements.sectionTitle.textContent = "Choose your first book";
  elements.pageBadge.textContent = `${state.library.length} books`;
  elements.currentText.textContent = "Choose a book to see its opening passage.";
  elements.playerSection.textContent = "Welcome";
  elements.playerText.textContent = "Press Play to hear your library welcome.";
  elements.progressBar.style.width = "0%";
  elements.progressText.textContent = "First visit";
  elements.libraryWelcomeText.textContent = state.config?.realtime_configured
    ? `You have ${state.library.length} books ready. Press Play once, then choose by voice.`
    : `You have ${state.library.length} books ready. Press Play to hear them, then choose below.`;
  elements.welcomeBookChoices.replaceChildren();
  for (const book of state.library) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "welcome-book-choice";
    const title = document.createElement("strong");
    title.textContent = book.title;
    const author = document.createElement("span");
    author.textContent = book.author || "Unknown author";
    button.append(title, author);
    button.addEventListener("click", () => chooseWelcomeBook(book.id));
    elements.welcomeBookChoices.append(button);
  }
  setPlaybackStatus("stopped", "Welcome");
  renderVoiceState();
}

function libraryWelcomePrompt() {
  const choices = state.library.map((book, index) => {
    const author = book.author ? ` by ${book.author}` : "";
    return `${index + 1}, ${book.title}${author}`;
  }).join("; ");
  return `Welcome to Talking Book. It looks like this is your first visit. `
    + `You have ${state.library.length} books ready: ${choices}. `
    + "Which one would you like to read?";
}

async function startHandsFreeWelcome() {
  if (![VOICE_STATES.DISCONNECTED, VOICE_STATES.ERROR].includes(state.voice.status)) {
    setVoiceMessage("Microphone is already starting. You can answer when the welcome finishes.");
    return;
  }
  if (state.config?.realtime_configured) {
    const started = await startVoiceSession({ welcome: true });
    if (started) return;
  }
  speakInterfacePrompt(libraryWelcomePrompt(), "Choose a book");
}

async function chooseWelcomeBook(bookId) {
  state.welcomeStage = null;
  elements.libraryWelcome.hidden = true;
  await loadBook(bookId, { speakOpening: true });
}

async function loadBook(bookId, {
  speakOpening = false,
  preserveVoice = false,
  welcomeStage = null,
} = {}) {
  if (!preserveVoice) stopVoiceSession();
  stopPlayback();
  clearAudioQueue();
  state.welcomeStage = welcomeStage;
  elements.libraryWelcome.hidden = true;
  elements.uploadStatus.textContent = "Loading book…";
  state.book = await api(`/api/books/${bookId}`);
  if (!preserveVoice) loadVoiceMemory(bookId);
  loadAnnotations(bookId);
  const persistedSession = readSavedSession(bookId);
  const saved = state.sessionMode === "new" ? null : persistedSession;
  applySavedSettings(saved);
  elements.bookSelect.value = bookId;
  elements.bookAuthor.textContent = state.book.author || "Unknown author";
  elements.bookStats.textContent = `${state.book.page_count} PDF pages · ${state.book.word_count.toLocaleString()} words`;
  elements.emptyState.hidden = true;
  elements.appShell.hidden = false;
  elements.player.hidden = false;
  elements.startPrompt.hidden = true;
  elements.resumePrompt.hidden = true;
  elements.chapterTransition.hidden = true;
  elements.resumeRecap.hidden = true;
  elements.resumeRecap.textContent = "";
  renderToc();
  const startingIndex = startSegment();
  state.openingChoice = bookOpeningChoice(state.book);
  selectSegment(startingIndex, { scroll: false, persist: false });

  const savedIndex = Number(saved?.segmentIndex);
  const savedBeforeOpening = savedPositionPrecedesOpening(
    savedIndex,
    state.book.segments.length,
    state.openingChoice.recommendedIndex,
  );
  const canResume = isValidSegmentIndex(savedIndex, state.book.segments.length)
    && isNarrationEligible(state.book.segments[savedIndex])
    && (state.sessionMode === "returning" || savedIndex !== startingIndex)
    && !savedBeforeOpening;
  state.resumeSegmentIndex = canResume ? savedIndex : null;
  elements.resumePrompt.hidden = !canResume;
  if (canResume) {
    const savedSegment = state.book.segments[savedIndex];
    const position = returningReaderPosition(state.book, savedIndex);
    elements.resumeText.textContent = position
      ? `You stopped in ${position.sectionTitle}, on physical PDF page ${position.pdfPage}, about ${position.progressPercent}% through this section.`
      : `Your saved position is on physical PDF page ${savedSegment.page}.`;
    elements.recapResume.hidden = !state.config.openai_configured;
  } else if (!saved?.started || savedBeforeOpening) {
    const author = state.book.author ? ` by ${state.book.author}` : "";
    const opening = state.openingChoice;
    elements.startTitle.textContent = `${state.book.title}${author}`;
    if (opening.status === "review_required") {
      elements.startText.textContent =
        "The opening could not be verified automatically. Start at the first extracted passage, or choose a section from Contents.";
      elements.readPreface.textContent = "Start first passage";
      elements.readPreface.hidden = false;
      elements.beginBook.hidden = true;
    } else if (opening.hasOpeningChoice) {
      const additional = Math.max(0, opening.openingSectionCount - 1);
      const extraText = additional
        ? ` and ${additional} more opening section${additional === 1 ? "" : "s"}`
        : "";
      elements.startText.textContent =
        `Recommended: begin with ${opening.recommendedTitle}${extraText}, or skip directly to ${opening.mainTitle}.`;
      elements.readPreface.textContent = `Start with ${opening.recommendedTitle}`;
      elements.beginBook.textContent = `Skip to ${opening.mainTitle}`;
      elements.readPreface.hidden = false;
      elements.beginBook.hidden = false;
    } else {
      elements.startText.textContent = `The book is ready at ${opening.mainTitle}.`;
      elements.beginBook.textContent = `Start ${opening.mainTitle}`;
      elements.readPreface.hidden = true;
      elements.beginBook.hidden = false;
    }
    elements.startPrompt.hidden = false;
  }
  elements.uploadStatus.textContent = "";
  if (speakOpening && !elements.startPrompt.hidden) speakOpeningPrompt();
}

function renderToc() {
  elements.toc.innerHTML = "";
  for (const section of chapterSections(state.book)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `level-${Math.min(section.level, 1)}`;
    button.dataset.section = section.index;
    button.textContent = section.title;
    button.addEventListener("click", () => {
      prepareVoiceForPlayback();
      selectSegment(firstReadableSegment(section));
    });
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
      if (state.annotations.some(
        (annotation) => annotation.kind === "highlight"
          && annotationAppliesToSegment(annotation, segment),
      )) span.classList.add("annotated-highlight");
      span.dataset.segment = index;
      span.textContent = `${segment.text}${index < paragraph.segment_end ? " " : ""}`;
      span.tabIndex = 0;
      span.addEventListener("click", () => {
        prepareVoiceForPlayback();
        stopPlayback(false);
        selectSegment(index);
      });
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          prepareVoiceForPlayback();
          stopPlayback(false);
          selectSegment(index);
        }
      });
      node.append(span);
    }
    elements.reader.append(node);

    const passageAnnotations = state.annotations.filter(
      (annotation) => annotation.paragraphIndex === paragraph.index
        && annotation.kind !== "highlight",
    );
    if (passageAnnotations.length) {
      const collection = document.createElement("section");
      collection.className = "passage-annotations";
      collection.setAttribute("aria-label", `Notes for PDF page ${paragraph.page}`);
      for (const annotation of passageAnnotations) {
        const item = document.createElement("article");
        item.className = `passage-annotation ${annotation.kind}`;
        const heading = document.createElement("strong");
        heading.textContent = `${annotation.kind === "research" ? "Research" : "Note"} · PDF page ${annotation.page}`;
        const content = document.createElement("p");
        content.textContent = annotation.content;
        item.append(heading, content);
        if (annotation.sources.length) {
          const sources = document.createElement("div");
          sources.className = "annotation-sources";
          for (const source of annotation.sources) {
            const link = document.createElement("a");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.title;
            sources.append(link);
          }
          item.append(sources);
        }
        collection.append(item);
      }
      elements.reader.append(collection);
    }
  }

  elements.toc.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.section) === sectionIndex);
  });
}

function selectSegment(index, { scroll = true, persist = true } = {}) {
  if (!state.book || index < 0 || index >= state.book.segments.length) return;
  elements.startPrompt.hidden = true;
  elements.resumePrompt.hidden = true;
  elements.chapterTransition.hidden = true;
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
  refreshPersistentVoiceContext(index);
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
  for (const nextIndex of upcomingNarrationSegmentIndices(index, state.book.segments, 2)) {
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
  elements.playButton.disabled = !state.book && state.welcomeStage !== "choose_book";
  elements.pauseButton.disabled = !["loading", "playing"].includes(state.status);
  elements.repeatParagraphButton.disabled = !state.book;
  elements.previousButton.disabled = !state.book
    || adjacentNarrationSegmentIndex(state.segmentIndex, state.book.segments, -1) === state.segmentIndex;
  elements.nextButton.disabled = !state.book
    || adjacentNarrationSegmentIndex(state.segmentIndex, state.book.segments, 1) === state.segmentIndex;
}

function prepareVoiceForPlayback() {
  if (
    state.voice.status !== VOICE_STATES.DISCONNECTED
    && !shouldKeepVoiceForPlayback(state.voice.persistent)
  ) {
    stopVoiceSession();
  }
}

function silenceVoiceCompanion() {
  const dataChannel = state.voice.dataChannel;
  if (!state.voice.persistent || dataChannel?.readyState !== "open") return;
  if (state.voice.responseActive) {
    dataChannel.send(JSON.stringify({ type: "response.cancel" }));
  }
  if (state.voice.responseActive || state.voice.companionAudioPlaying) {
    dataChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
  }
  state.voice.responseActive = false;
  state.voice.companionAudioPlaying = false;
}

function showChapterTransition(transition) {
  cancelOutputs(false);
  selectSegment(transition.nextIndex);
  elements.chapterCompleteTitle.textContent = `${transition.completedTitle} complete`;
  elements.chapterNextText.textContent = `Up next: ${transition.nextTitle}`;
  elements.chapterTransition.hidden = false;
  setPlaybackStatus("stopped", "Section complete");
}

function continueChapterTransition() {
  elements.chapterTransition.hidden = true;
  speakCurrent();
}

function stayAtChapterTransition() {
  elements.chapterTransition.hidden = true;
  setPlaybackStatus("stopped", "Paused at next section");
}

function speakInterfacePrompt(text, stoppedLabel = "Choose an option") {
  if (!("speechSynthesis" in window)) {
    elements.uploadStatus.textContent = "This browser does not support spoken welcome prompts.";
    setPlaybackStatus("error", "Voice unavailable");
    return;
  }
  cancelOutputs(true);
  elements.playerText.textContent = text;
  const token = state.token;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Number(elements.rate.value);
  utterance.onend = () => {
    if (!isCurrentPlaybackToken(token, state.token)) return;
    state.utterance = null;
    setPlaybackStatus("stopped", stoppedLabel);
  };
  utterance.onerror = (event) => {
    if (event.error !== "canceled" && isCurrentPlaybackToken(token, state.token)) {
      setPlaybackStatus("error", "Welcome voice failed");
    }
  };
  state.utterance = utterance;
  setPlaybackStatus("playing", "Welcome");
  window.speechSynthesis.speak(utterance);
}

function openingPromptText() {
  if (!state.book || !state.openingChoice) return "Choose where you would like to begin.";
  const author = state.book.author ? ` by ${state.book.author}` : "";
  const opening = state.openingChoice;
  if (opening.status === "review_required") {
    return `You chose ${state.book.title}${author}. I could not confidently verify its opening structure. `
      + "Choose Start first passage, or select a section from Contents.";
  }
  if (opening.hasOpeningChoice) {
    return `You chose ${state.book.title}${author}. Would you like to begin with `
      + `${opening.recommendedTitle}, or skip directly to ${opening.mainTitle}?`;
  }
  return `You chose ${state.book.title}${author}. It is ready at ${opening.mainTitle}. `
    + `Choose Start ${opening.mainTitle} when you are ready.`;
}

function speakOpeningPrompt() {
  elements.playerSection.textContent = state.book?.title || "Book opening";
  speakInterfacePrompt(openingPromptText(), "Choose where to begin");
}

async function speakCurrent() {
  if (!state.book) return;
  const segment = state.book.segments[state.segmentIndex];
  if (!segment) return;
  silenceVoiceCompanion();
  cancelOutputs(true);
  selectSegment(state.segmentIndex);
  if (state.voice.persistent) {
    setVoiceMessage("Reading with the microphone live. Speak to pause.");
  }
  const token = state.token;

  const finished = () => {
    if (!isCurrentPlaybackToken(token, state.token) || state.status !== "playing") return;
    const nextIndex = adjacentNarrationSegmentIndex(state.segmentIndex, state.book.segments, 1);
    if (nextIndex === state.segmentIndex) {
      setPlaybackStatus("stopped", "Finished");
      return;
    }
    const transition = chapterTransitionAfter(state.book, state.segmentIndex);
    if (transition) {
      showChapterTransition(transition);
      return;
    }
    state.segmentIndex = nextIndex;
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
  prepareVoiceForPlayback();
  if (state.welcomeStage === "choose_book") {
    startHandsFreeWelcome();
    return;
  }
  if (!state.book) return;
  if (!elements.startPrompt.hidden) {
    speakOpeningPrompt();
    return;
  }
  if (!elements.resumePrompt.hidden) {
    speakInterfacePrompt(
      `Welcome back. ${elements.resumeText.textContent} Choose Continue reading or Start over.`,
      "Resume or start over",
    );
    return;
  }
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
  prepareVoiceForPlayback();
  const direction = offset < 0 ? -1 : 1;
  let target = state.segmentIndex;
  for (let count = 0; count < Math.abs(offset); count += 1) {
    target = adjacentNarrationSegmentIndex(target, state.book.segments, direction);
  }
  if (target === state.segmentIndex) return;
  const wasActive = ["playing", "loading"].includes(state.status);
  const wasPaused = state.status === "paused";
  cancelOutputs(true);
  selectSegment(target);
  setPlaybackStatus(wasPaused ? "paused" : "stopped");
  if (wasActive) speakCurrent();
}

function beginReading(kind) {
  prepareVoiceForPlayback();
  elements.startPrompt.hidden = true;
  selectSegment(startSegment(kind));
  setPlaybackStatus("stopped");
  speakCurrent();
}

function beginRecommendedOpening() {
  if (state.openingChoice?.status === "review_required") {
    beginReading("first_eligible_segment");
    return;
  }
  const target = state.openingChoice?.recommendedIndex;
  if (!isValidSegmentIndex(target, state.book?.segments.length)) return;
  prepareVoiceForPlayback();
  elements.startPrompt.hidden = true;
  const section = sectionForSegment(state.book.segments[target]);
  selectSegment(section ? firstReadableSegment(section) : target);
  setPlaybackStatus("stopped");
  speakCurrent();
}

function repeatParagraph() {
  if (!state.book) return;
  prepareVoiceForPlayback();
  const segment = state.book.segments[state.segmentIndex];
  const start = paragraphStartSegment(segment, state.book.paragraphs, state.segmentIndex);
  selectSegment(start);
  speakCurrent();
}

function continueSavedSession() {
  if (state.resumeSegmentIndex == null) return;
  prepareVoiceForPlayback();
  const target = state.resumeSegmentIndex;
  state.resumeSegmentIndex = null;
  elements.resumePrompt.hidden = true;
  selectSegment(target);
  setPlaybackStatus("stopped", "Position restored");
  speakCurrent();
}

function dismissSavedSession() {
  state.resumeSegmentIndex = null;
  elements.resumePrompt.hidden = true;
  beginRecommendedOpening();
}

async function recapSavedSession() {
  if (state.resumeSegmentIndex == null || !state.config?.openai_configured) return;
  elements.recapResume.disabled = true;
  elements.resumeRecap.hidden = false;
  elements.resumeRecap.textContent = "Preparing a short recap…";
  try {
    const result = await api(`/api/books/${state.book.id}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_index: state.resumeSegmentIndex,
        question: "In two or three concise sentences, recap what is happening near this saved position so the reader can continue. Use only the supplied passage context.",
      }),
    });
    elements.resumeRecap.textContent = result.answer;
  } catch (error) {
    elements.resumeRecap.textContent = error.message;
  } finally {
    elements.recapResume.disabled = false;
  }
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

async function reindexCurrentBook() {
  if (!state.book) return;
  const bookId = state.book.id;
  const saved = readSavedSession(bookId);
  const savedIndex = Number.isInteger(saved?.segmentIndex)
    ? saved.segmentIndex
    : null;
  stopVoiceSession();
  stopPlayback();
  clearAudioQueue();
  elements.reindexBook.disabled = true;
  elements.uploadStatus.textContent = "Re-analyzing from the original PDF…";
  try {
    const result = await api(`/api/books/${bookId}/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment_index: savedIndex }),
    });
    if (savedIndex != null) {
      updateSavedSessionCursor(bookId, result.segment_index);
    }
    state.library = await api("/api/books");
    renderLibrary();
    await loadBook(bookId);
    const cursorMessage = result.cursor_status === "exact"
      ? "Your saved sentence was preserved."
      : savedIndex == null
        ? "The new opening map is ready."
        : "Your saved position moved to the nearest readable passage.";
    const reviewMessage = result.opening_status === "review_required"
      ? " The opening still needs review."
      : "";
    elements.uploadStatus.textContent = `Book re-analyzed. ${cursorMessage}${reviewMessage}`;
  } catch (error) {
    elements.uploadStatus.textContent = error.message;
  } finally {
    elements.reindexBook.disabled = false;
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

const voiceLabels = {
  disconnected: "Ready",
  requesting: "Permission",
  connecting: "Connecting",
  listening: "Live",
  muted: "Muted",
  stopping: "Ending",
  error: "Error",
};

function renderVoiceState() {
  const status = state.voice.status;
  const canEnd = [
    VOICE_STATES.REQUESTING,
    VOICE_STATES.CONNECTING,
    VOICE_STATES.LISTENING,
    VOICE_STATES.MUTED,
  ].includes(status);
  const configured = Boolean(state.config?.realtime_configured);
  elements.voiceStatus.textContent = voiceLabels[status] || status;
  elements.voiceStatus.dataset.state = status;
  elements.voiceMessage.textContent = state.voice.message;
  elements.startVoiceButton.disabled = status === VOICE_STATES.STOPPING
    || (!canEnd && (!configured || !state.book));
  elements.startVoiceButton.textContent = canEnd
    ? state.voice.resumeNarration ? "Continue reading" : "End voice"
    : status === VOICE_STATES.ERROR ? "Try again" : "Ask by voice";
  elements.clearVoiceMemoryButton.disabled = !state.voice.memory.length;
}

function applyVoiceEvent(event, message) {
  state.voice.status = transitionVoiceState(state.voice.status, event);
  if (message) state.voice.message = message;
  renderVoiceState();
}

function setVoiceMessage(message) {
  state.voice.message = message;
  renderVoiceState();
}

function loadVoiceMemory(bookId) {
  try {
    state.voice.memory = sanitizeVoiceTurns(
      JSON.parse(localStorage.getItem(voiceMemoryKey(bookId))) || [],
    );
  } catch {
    state.voice.memory = [];
  }
  renderVoiceTranscript();
  renderVoiceState();
}

function saveVoiceMemory() {
  if (!state.book) return;
  try {
    localStorage.setItem(
      voiceMemoryKey(state.book.id),
      JSON.stringify(state.voice.memory),
    );
  } catch {
    // A voice session still works when local storage is unavailable.
  }
}

function renderVoiceTranscript() {
  elements.voiceTranscript.replaceChildren();
  if (!state.voice.memory.length) {
    const empty = document.createElement("p");
    empty.className = "voice-transcript-empty";
    empty.textContent = "Your recent voice turns will appear here.";
    elements.voiceTranscript.append(empty);
    return;
  }
  for (const turn of state.voice.memory) {
    const item = document.createElement("div");
    item.className = `voice-turn ${turn.role}`;
    const role = document.createElement("strong");
    role.textContent = turn.role === "user" ? "You" : "Book companion";
    const text = document.createElement("p");
    text.textContent = turn.text;
    item.append(role, text);
    elements.voiceTranscript.append(item);
  }
  elements.voiceTranscript.scrollTop = elements.voiceTranscript.scrollHeight;
}

function rememberVoiceTurn(turn) {
  if (!turn?.text) return;
  state.voice.memory = appendVoiceTurn(state.voice.memory, turn);
  saveVoiceMemory();
  renderVoiceTranscript();
  renderVoiceState();
}

async function refreshPersistentVoiceContext(segmentIndex) {
  const segment = state.book?.segments[segmentIndex];
  const dataChannel = state.voice.dataChannel;
  if (
    !state.voice.persistent
    || ["choose_book", "opening"].includes(state.welcomeStage)
    || !segment
    || dataChannel?.readyState !== "open"
    || segment.paragraph === state.voice.contextParagraph
  ) return;

  const paragraph = segment.paragraph;
  const token = state.voice.token;
  state.voice.contextParagraph = paragraph;
  try {
    const result = await api(`/api/books/${state.book.id}/realtime/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_index: segmentIndex,
        recent_turns: state.voice.memory,
      }),
    });
    const currentSegment = state.book?.segments[state.segmentIndex];
    if (
      token !== state.voice.token
      || !state.voice.persistent
      || currentSegment?.paragraph !== paragraph
      || dataChannel.readyState !== "open"
    ) return;
    dataChannel.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: result.instructions,
        tools: result.tools,
        tool_choice: result.tool_choice,
      },
    }));
  } catch {
    if (token === state.voice.token && state.voice.persistent) {
      state.voice.contextParagraph = null;
      setVoiceMessage("Microphone live, but passage context could not be refreshed.");
    }
  }
}

async function executeWelcomeAction(action) {
  const libraryBook = state.library.find((book) => book.id === action.bookId);
  if (!libraryBook) return;

  if (action.action === "select_book") {
    if (state.welcomeStage !== "choose_book") {
      sendVoiceToolResult(action.callId, {
        executed: false,
        error: "A book has already been selected.",
      }, { respond: true });
      return;
    }
    state.welcomeStage = "opening";
    setVoiceMessage(`Opening ${libraryBook.title}…`);
    try {
      await loadBook(action.bookId, {
        preserveVoice: true,
        welcomeStage: "opening",
      });
    } catch (error) {
      state.welcomeStage = "choose_book";
      sendVoiceToolResult(action.callId, {
        executed: false,
        error: error.message,
      }, { respond: true });
      return;
    }
    const opening = state.openingChoice;
    const decisionEvents = welcomeOpeningDecisionEvents(opening.hasOpeningChoice);
    state.voice.dataChannel.send(JSON.stringify(decisionEvents.requireDecision));
    sendVoiceToolResult(action.callId, {
      executed: true,
      book_id: state.book.id,
      title: state.book.title,
      author: state.book.author || null,
      opening_status: opening.status,
      has_opening_choice: opening.hasOpeningChoice,
      recommended_title: opening.recommendedTitle,
      main_title: opening.mainTitle,
    });
    state.voice.dataChannel.send(JSON.stringify(decisionEvents.askQuestion));
    setVoiceMessage("Book selected. Listening for where you want to begin.");
    return;
  }

  if (
    action.action !== "start_reading"
    || state.welcomeStage !== "opening"
    || state.book?.id !== action.bookId
  ) {
    sendVoiceToolResult(action.callId, {
      executed: false,
      error: "Select the book before choosing where to begin.",
    }, { respond: true });
    return;
  }

  sendVoiceToolResult(action.callId, {
    executed: true,
    book_id: state.book.id,
    start: action.start,
  });
  state.welcomeStage = null;
  state.voice.welcome = false;
  if (action.start === "recommended") beginRecommendedOpening();
  else beginReading("main_text_segment");
}

function handleRealtimeEvent(event) {
  if (event.type === "response.created") {
    state.voice.responseActive = true;
  } else if (event.type === "response.done") {
    state.voice.responseActive = false;
  } else if (event.type === "output_audio_buffer.started") {
    state.voice.companionAudioPlaying = true;
  } else if (event.type === "output_audio_buffer.stopped"
    || event.type === "output_audio_buffer.cleared") {
    state.voice.companionAudioPlaying = false;
  }

  const completed = completedVoiceTurn(event);
  if (completed?.text) rememberVoiceTurn(completed);

  const welcomeAction = completedWelcomeAction(
    event,
    state.library.map((book) => book.id),
  );
  if (welcomeAction) {
    executeWelcomeAction(welcomeAction).catch((error) => {
      failVoiceSession(error.message || "The spoken welcome could not continue.");
    });
    return;
  }

  const readerAction = completedReaderAction(event);
  if (readerAction) {
    executeReaderAction(readerAction);
    return;
  }

  const annotationAction = completedAnnotationAction(event);
  if (annotationAction) {
    executeAnnotationAction(annotationAction);
    return;
  }

  if (event.type === "input_audio_buffer.speech_started") {
    if (shouldInterruptNarration(state.voice.persistent, state.status)) {
      state.voice.resumeNarration = true;
      stopPlayback();
      setVoiceMessage("Book paused. Listening to you…");
    } else {
      setVoiceMessage("Listening to you…");
    }
  } else if (event.type === "input_audio_buffer.speech_stopped") {
    setVoiceMessage(state.voice.welcome ? "Understanding your choice…" : "Thinking about that passage…");
  } else if (event.type === "response.output_audio_transcript.delta") {
    setVoiceMessage("Book companion is speaking…");
  } else if (event.type === "response.done") {
    setVoiceMessage(
      state.voice.status === VOICE_STATES.MUTED
        ? "Microphone muted."
        : state.voice.welcome
          ? "Microphone live. Say the book or starting point you want."
        : state.voice.persistent
          ? "Microphone live. Speak to pause the book."
        : "Listening. Ask about the current passage.",
    );
  } else if (event.type === "error") {
    failVoiceSession(event.error?.message || "The voice session reported an error.");
  }
}

function sendVoiceToolResult(callId, result, { respond = false } = {}) {
  const dataChannel = state.voice.dataChannel;
  if (dataChannel?.readyState !== "open") return;
  dataChannel.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result),
    },
  }));
  if (respond) {
    dataChannel.send(JSON.stringify({ type: "response.create" }));
  }
}

function refreshVisibleAnnotations() {
  if (state.sectionIndex == null) return;
  const currentIndex = state.segmentIndex;
  renderSection(state.sectionIndex);
  selectSegment(currentIndex, { scroll: false, persist: false });
}

async function executeAnnotationAction(action) {
  if (!state.book) return;
  const segmentIndex = state.segmentIndex;
  const segment = state.book.segments[segmentIndex];
  if (!segment) return;
  let content = action.text;
  let sources = [];

  if (action.action === "research") {
    setVoiceMessage(`Researching this ${action.scope}…`);
    try {
      const result = await api(`/api/books/${state.book.id}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_index: segmentIndex,
          scope: action.scope,
          query: action.text,
        }),
      });
      content = result.answer;
      sources = result.sources;
    } catch (error) {
      sendVoiceToolResult(action.callId, {
        executed: false,
        error: error.message,
      }, { respond: true });
      setVoiceMessage("Research could not be completed. The microphone remains live.");
      return;
    }
  }

  const annotation = createAnchoredAnnotation({
    action: action.action,
    scope: action.scope,
    content,
    sources,
    book: state.book,
    segmentIndex,
    id: globalThis.crypto?.randomUUID?.() || `annotation-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  if (!annotation) {
    sendVoiceToolResult(action.callId, {
      executed: false,
      error: "The current passage could not be anchored.",
    }, { respond: true });
    return;
  }

  state.annotations.push(annotation);
  saveAnnotations();
  refreshVisibleAnnotations();
  sendVoiceToolResult(action.callId, {
    executed: true,
    action: action.action,
    scope: action.scope,
    physical_pdf_page: annotation.page,
    saved_content: annotation.content,
    source_count: annotation.sources.length,
  }, { respond: true });
  setVoiceMessage(
    action.action === "research"
      ? `Research saved to PDF page ${annotation.page}.`
      : action.action === "highlight"
        ? `${action.scope === "paragraph" ? "Paragraph" : "Sentence"} highlighted on PDF page ${annotation.page}.`
        : `Note saved to PDF page ${annotation.page}.`,
  );
}

function executeReaderAction(action) {
  if (!state.book) return;
  sendVoiceToolResult(action.callId, {
    executed: true,
    action: action.action,
    scope: action.scope,
  });
  if (action.action === "continue" && action.scope === "current_position") {
    state.voice.resumeNarration = false;
    if (state.voice.persistent) {
      speakCurrent();
      setVoiceMessage("Continuing. Microphone remains live.");
    } else {
      stopVoiceSession({ continueNarration: true });
    }
  } else if (action.action === "repeat" && action.scope === "paragraph") {
    state.voice.resumeNarration = false;
    repeatParagraph();
    if (state.voice.persistent) {
      setVoiceMessage("Repeating the paragraph. Microphone remains live.");
    }
  }
}

function releaseVoiceResources() {
  const { dataChannel, peerConnection, mediaStream } = state.voice;
  if (dataChannel) {
    dataChannel.onopen = null;
    dataChannel.onmessage = null;
    dataChannel.onerror = null;
    dataChannel.close();
  }
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
  }
  mediaStream?.getTracks().forEach((track) => track.stop());
  elements.assistantAudio.pause();
  elements.assistantAudio.srcObject = null;
  state.voice.dataChannel = null;
  state.voice.peerConnection = null;
  state.voice.mediaStream = null;
}

function failVoiceSession(message) {
  state.voice.token += 1;
  state.voice.resumeNarration = false;
  state.voice.persistent = false;
  state.voice.welcome = false;
  state.voice.contextParagraph = null;
  state.voice.responseActive = false;
  state.voice.companionAudioPlaying = false;
  releaseVoiceResources();
  applyVoiceEvent("FAIL", message);
}

async function startVoiceSession({ persistent = false, welcome = false } = {}) {
  const hasContext = welcome ? state.library.length > 0 : Boolean(state.book);
  if (!hasContext || !state.config?.realtime_configured) {
    setVoiceMessage("Add OPENAI_API_KEY to .env, restart, and try again.");
    return false;
  }
  if (![VOICE_STATES.DISCONNECTED, VOICE_STATES.ERROR].includes(state.voice.status)) {
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia || !("RTCPeerConnection" in window)) {
    failVoiceSession("This browser does not support microphone WebRTC sessions.");
    return false;
  }

  state.voice.persistent = Boolean(persistent);
  state.voice.welcome = Boolean(welcome);
  state.voice.contextParagraph = null;
  state.voice.resumeNarration = persistent ? false : shouldResumeAfterVoice(state.status);
  if (shouldPauseNarrationForVoiceStart(persistent)) stopPlayback();
  const token = state.voice.token + 1;
  state.voice.token = token;
  applyVoiceEvent("START", "Waiting for microphone permission…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (token !== state.voice.token) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.voice.mediaStream = stream;
    applyVoiceEvent("PERMISSION_GRANTED", "Connecting to the book companion…");

    const peerConnection = new RTCPeerConnection();
    state.voice.peerConnection = peerConnection;
    peerConnection.ontrack = (event) => {
      elements.assistantAudio.srcObject = event.streams[0];
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "failed" && token === state.voice.token) {
        failVoiceSession("The voice connection failed. Please try again.");
      }
    };
    for (const track of stream.getTracks()) peerConnection.addTrack(track, stream);

    const dataChannel = peerConnection.createDataChannel("oai-events");
    state.voice.dataChannel = dataChannel;
    dataChannel.onmessage = (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data));
      } catch {
        // Ignore non-JSON diagnostic messages without ending a healthy audio session.
      }
    };
    dataChannel.onerror = () => {
      if (token === state.voice.token) failVoiceSession("The voice event channel failed.");
    };
    dataChannel.onopen = () => {
      if (token !== state.voice.token) return;
      state.voice.contextParagraph = state.book?.segments[state.segmentIndex]?.paragraph ?? null;
      applyVoiceEvent(
        "CONNECTED",
        state.voice.welcome
          ? "Microphone live. Tell me which book you want."
          : "Listening at the stopped sentence. Ask a question or request a note.",
      );
      if (shouldCreateInitialVoiceResponse(state.voice.persistent, state.voice.welcome)) {
        dataChannel.send(JSON.stringify({ type: "response.create" }));
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const endpoint = welcome
      ? "/api/realtime/library"
      : `/api/books/${state.book.id}/realtime`;
    const payload = welcome
      ? {
          sdp: offer.sdp,
          recent_turns: state.voice.memory,
        }
      : {
          sdp: offer.sdp,
          segment_index: state.segmentIndex,
          recent_turns: state.voice.memory,
        };
    const answerSdp = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (token !== state.voice.token) return;
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    return true;
  } catch (error) {
    if (token !== state.voice.token) return false;
    const message = error.name === "NotAllowedError"
      ? "Microphone permission was not granted. Allow it and try again."
      : error.message || "Could not start the voice session.";
    failVoiceSession(message);
    return false;
  }
}

function toggleOnDemandVoice() {
  if ([
    VOICE_STATES.REQUESTING,
    VOICE_STATES.CONNECTING,
    VOICE_STATES.LISTENING,
    VOICE_STATES.MUTED,
  ].includes(state.voice.status)) {
    stopVoiceSession({ resumeInterruptedNarration: true });
    return;
  }
  startVoiceSession();
}

function stopVoiceSession({
  continueNarration = false,
  resumeInterruptedNarration = false,
} = {}) {
  const shouldResume = Boolean(
    state.book && (
      continueNarration
      || (resumeInterruptedNarration && state.voice.resumeNarration)
    ),
  );
  state.voice.resumeNarration = false;
  state.voice.persistent = false;
  state.voice.welcome = false;
  state.voice.contextParagraph = null;
  state.voice.responseActive = false;
  state.voice.companionAudioPlaying = false;
  state.voice.token += 1;
  if (state.voice.status !== VOICE_STATES.DISCONNECTED) {
    applyVoiceEvent("STOP", "Ending the voice session…");
  }
  releaseVoiceResources();
  if (state.voice.status !== VOICE_STATES.DISCONNECTED) {
    applyVoiceEvent(
      "STOPPED",
      shouldResume
        ? "Session ended. Continuing narration."
        : "Session ended. Narration remains stopped.",
    );
  } else {
    renderVoiceState();
  }
  if (shouldResume) speakCurrent();
}

function clearVoiceMemory() {
  state.voice.memory = [];
  if (state.book) localStorage.removeItem(voiceMemoryKey(state.book.id));
  renderVoiceTranscript();
  renderVoiceState();
}

elements.pdfInput.addEventListener("change", uploadSelectedFile);
elements.bookSelect.addEventListener("change", (event) => {
  if (state.welcomeStage === "choose_book") chooseWelcomeBook(event.target.value);
  else loadBook(event.target.value);
});
elements.reindexBook.addEventListener("click", reindexCurrentBook);
elements.playButton.addEventListener("click", playOrContinue);
elements.pauseButton.addEventListener("click", pausePlayback);
elements.previousButton.addEventListener("click", () => moveBySentence(-1));
elements.nextButton.addEventListener("click", () => moveBySentence(1));
elements.repeatParagraphButton.addEventListener("click", repeatParagraph);
elements.continueResume.addEventListener("click", continueSavedSession);
elements.dismissResume.addEventListener("click", dismissSavedSession);
elements.recapResume.addEventListener("click", recapSavedSession);
elements.continueChapter.addEventListener("click", continueChapterTransition);
elements.stayAtChapter.addEventListener("click", stayAtChapterTransition);
elements.readPreface.addEventListener("click", beginRecommendedOpening);
elements.beginBook.addEventListener("click", () => beginReading("main_text_segment"));
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
elements.startVoiceButton.addEventListener("click", toggleOnDemandVoice);
elements.clearVoiceMemoryButton.addEventListener("click", clearVoiceMemory);
window.addEventListener("beforeunload", () => {
  saveSession();
  releaseVoiceResources();
  cancelOutputs(true);
  clearAudioQueue();
});

renderVoiceState();
renderVoiceTranscript();
initialize();
