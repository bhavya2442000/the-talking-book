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
