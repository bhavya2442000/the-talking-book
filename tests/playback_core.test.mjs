import assert from "node:assert/strict";
import test from "node:test";

import {
  chapterProgressPercent,
  clampSegmentIndex,
  isCurrentPlaybackToken,
  isValidSegmentIndex,
  paragraphStartSegment,
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
