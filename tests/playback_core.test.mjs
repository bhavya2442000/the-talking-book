import assert from "node:assert/strict";
import test from "node:test";

import {
  adjacentNarrationSegmentIndex,
  chapterProgressPercent,
  clampSegmentIndex,
  isCurrentPlaybackToken,
  isNarrationEligible,
  isValidSegmentIndex,
  paragraphStartSegment,
  readingOrderSegmentIndex,
  upcomingNarrationSegmentIndices,
  upcomingSegmentIndices,
} from "../static/playback_core.mjs";

test("segment indices are validated and clamped", () => {
  assert.equal(isValidSegmentIndex(4, 5), true);
  assert.equal(isValidSegmentIndex(5, 5), false);
  assert.equal(isValidSegmentIndex(-1, 5), false);
  assert.equal(clampSegmentIndex(-3, 10), 0);
  assert.equal(clampSegmentIndex(14, 10), 9);
  assert.equal(clampSegmentIndex(-1, 10), 0);
  assert.equal(clampSegmentIndex(10, 10), 9);
});

test("chapter progress is bounded and rounded", () => {
  assert.equal(chapterProgressPercent(100, 100, 200), 0);
  assert.equal(chapterProgressPercent(125, 100, 200), 25);
  assert.equal(chapterProgressPercent(250, 100, 200), 100);
  assert.equal(chapterProgressPercent(7, 7, 7), 100);
  assert.equal(chapterProgressPercent(6, 7, 7), 0);
});

test("prefetch returns the next two available sentences", () => {
  assert.deepEqual(upcomingSegmentIndices(10, 20), [11, 12]);
  assert.deepEqual(upcomingSegmentIndices(18, 20), [19]);
  assert.deepEqual(upcomingSegmentIndices(19, 20), []);
  assert.deepEqual(upcomingSegmentIndices(20, 20), []);
});

test("repeat paragraph resolves its first sentence with a safe fallback", () => {
  const paragraphs = [
    { segment_start: 0 },
    { segment_start: 4 },
  ];
  assert.equal(paragraphStartSegment({ paragraph: 1 }, paragraphs, 6), 4);
  assert.equal(paragraphStartSegment({ paragraph: 9 }, paragraphs, 6), 6);
  assert.equal(paragraphStartSegment(null, paragraphs, 6), 6);
});

test("stale playback events are rejected after token invalidation", () => {
  assert.equal(isCurrentPlaybackToken(12, 12), true);
  assert.equal(isCurrentPlaybackToken(11, 12), false);
});

test("narration skips segments marked as non-readable", () => {
  const segments = [
    { narration_eligible: false },
    { narration_eligible: true },
    { narration_eligible: false },
    {},
  ];
  assert.equal(isNarrationEligible(segments[0]), false);
  assert.equal(isNarrationEligible(segments[1]), true);
  assert.equal(adjacentNarrationSegmentIndex(1, segments, 1), 3);
  assert.equal(adjacentNarrationSegmentIndex(3, segments, -1), 1);
  assert.deepEqual(upcomingNarrationSegmentIndices(0, segments, 2), [1, 3]);
});

test("reading starts use explicit cursors without treating null as segment zero", () => {
  const book = {
    reading_order: {
      first_eligible_segment: 2,
      preface_segment: null,
      main_text_segment: 4,
    },
    segments: Array.from({ length: 6 }, (_, index) => ({
      narration_eligible: index >= 2,
    })),
  };
  assert.equal(readingOrderSegmentIndex(book), 4);
  assert.equal(readingOrderSegmentIndex(book, "preface_segment"), 2);
});
