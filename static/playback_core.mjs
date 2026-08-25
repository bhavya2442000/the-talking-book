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
