/** Pure playback calculations shared by the browser and automated tests. */

export function isValidSegmentIndex(index, total) {
  return Number.isInteger(index) && index >= 0 && index < total;
}

export function clampSegmentIndex(index, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

export function chapterProgressPercent(index, start, end) {
  if (end <= start) return index >= start ? 100 : 0;
  const span = Math.max(1, end - start);
  const progress = Math.max(0, Math.min(1, (index - start) / span));
  return Math.round(progress * 100);
}

export function paragraphStartSegment(segment, paragraphs, fallbackIndex = 0) {
  const paragraphIndex = segment?.paragraph;
  const start = Number.isInteger(paragraphIndex)
    ? paragraphs?.[paragraphIndex]?.segment_start
    : null;
  return Number.isInteger(start) && start >= 0 ? start : fallbackIndex;
}

export function isCurrentPlaybackToken(eventToken, currentToken) {
  return eventToken === currentToken;
}

export function upcomingSegmentIndices(index, total, count = 2) {
  const upcoming = [];
  for (let offset = 1; offset <= count; offset += 1) {
    const candidate = index + offset;
    if (candidate >= total) break;
    upcoming.push(candidate);
  }
  return upcoming;
}

export function isNarrationEligible(segment) {
  return Boolean(segment) && segment.narration_eligible !== false;
}

export function adjacentNarrationSegmentIndex(index, segments, direction = 1) {
  const step = direction < 0 ? -1 : 1;
  for (let candidate = index + step; candidate >= 0 && candidate < segments.length; candidate += step) {
    if (isNarrationEligible(segments[candidate])) return candidate;
  }
  return index;
}

export function upcomingNarrationSegmentIndices(index, segments, count = 2) {
  const upcoming = [];
  let cursor = index;
  while (upcoming.length < count) {
    const candidate = adjacentNarrationSegmentIndex(cursor, segments, 1);
    if (candidate === cursor) break;
    upcoming.push(candidate);
    cursor = candidate;
  }
  return upcoming;
}

export function readingOrderSegmentIndex(book, kind = "main_text_segment") {
  const total = book?.segments?.length ?? 0;
  const preferred = book?.reading_order?.[kind];
  if (isValidSegmentIndex(preferred, total)) return preferred;

  const fallback = book?.reading_order?.first_eligible_segment;
  if (isValidSegmentIndex(fallback, total)) return fallback;

  return book?.segments?.findIndex(isNarrationEligible) ?? -1;
}

function sectionAtSegment(book, index) {
  if (!isValidSegmentIndex(index, book?.segments?.length ?? 0)) return null;
  const sectionIndex = book.segments[index]?.section;
  return Number.isInteger(sectionIndex) ? book.sections?.[sectionIndex] ?? null : null;
}

export function chapterTransitionAfter(book, index) {
  const segments = book?.segments ?? [];
  if (!isValidSegmentIndex(index, segments.length)) return null;
  const nextIndex = adjacentNarrationSegmentIndex(index, segments, 1);
  if (nextIndex === index) return null;
  const currentSection = sectionAtSegment(book, index);
  const nextSection = sectionAtSegment(book, nextIndex);
  if (!currentSection || !nextSection || currentSection.index === nextSection.index) {
    return null;
  }
  return {
    completedTitle: currentSection.title || "Current section",
    nextTitle: nextSection.title || "Next section",
    nextIndex,
  };
}

export function bookOpeningChoice(book) {
  const total = book?.segments?.length ?? 0;
  const mainIndex = readingOrderSegmentIndex(book, "main_text_segment");
  const optionalIndices = [
    book?.reading_order?.preface_segment,
    book?.reading_order?.introduction_segment,
  ].filter((index) => isValidSegmentIndex(index, total) && index < mainIndex);
  const recommendedIndex = optionalIndices[0] ?? mainIndex;
  const recommendedSection = sectionAtSegment(book, recommendedIndex);
  const mainSection = sectionAtSegment(book, mainIndex);
  const openingSectionCount = book?.sections?.filter((section) =>
    section.narration_eligible !== false
    && Number.isInteger(section.segment_start)
    && section.segment_start >= recommendedIndex
    && section.segment_start < mainIndex
  ).length ?? 0;

  return {
    status: book?.opening_plan?.status === "review_required"
      ? "review_required"
      : "ready",
    recommendedIndex,
    recommendedTitle: recommendedSection?.title || "the opening",
    mainIndex,
    mainTitle: mainSection?.title || "the main text",
    openingSectionCount,
    hasOpeningChoice: recommendedIndex !== mainIndex,
  };
}

export function savedPositionPrecedesOpening(savedIndex, total, openingIndex) {
  return isValidSegmentIndex(savedIndex, total)
    && isValidSegmentIndex(openingIndex, total)
    && savedIndex < openingIndex;
}

export function readerSessionMode(search = "") {
  const value = new URLSearchParams(search).get("session");
  return ["new", "returning"].includes(value) ? value : "normal";
}

export function libraryEntryDecision(library, savedSessions = {}, sessionMode = "normal") {
  if (!Array.isArray(library) || !library.length) return { kind: "empty", bookId: null };
  const started = library
    .map((book, order) => ({
      book,
      order,
      session: savedSessions?.[book.id],
    }))
    .filter((item) => item.session?.started)
    .sort((left, right) => {
      const leftTime = Date.parse(left.session.updatedAt || "") || 0;
      const rightTime = Date.parse(right.session.updatedAt || "") || 0;
      return rightTime - leftTime || left.order - right.order;
    });

  if (sessionMode !== "new" && started.length) {
    return { kind: "returning", bookId: started[0].book.id };
  }
  if (library.length > 1) return { kind: "choose_book", bookId: null };
  return { kind: "first_book", bookId: library[0].id };
}

export function returningReaderPosition(book, index) {
  if (!isValidSegmentIndex(index, book?.segments?.length ?? 0)) return null;
  const segment = book.segments[index];
  const section = Number.isInteger(segment.section)
    ? book.sections?.[segment.section] ?? null
    : null;
  const progressPercent = section?.segment_start != null
    && section?.segment_end != null
    ? chapterProgressPercent(index, section.segment_start, section.segment_end)
    : 0;
  return {
    sectionTitle: section?.title || book?.title || "Saved passage",
    pdfPage: segment.page,
    progressPercent,
  };
}
