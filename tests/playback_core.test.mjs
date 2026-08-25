import assert from "node:assert/strict";
import test from "node:test";

import {
  chapterProgressPercent,
  clampSegmentIndex,
  isValidSegmentIndex,
  upcomingSegmentIndices,
} from "../static/playback_core.mjs";

test("segment indices are validated and clamped", () => {
  assert.equal(isValidSegmentIndex(4, 5), true);
  assert.equal(isValidSegmentIndex(5, 5), false);
  assert.equal(isValidSegmentIndex(-1, 5), false);
  assert.equal(clampSegmentIndex(-3, 10), 0);
  assert.equal(clampSegmentIndex(14, 10), 9);
});

test("chapter progress is bounded and rounded", () => {
  assert.equal(chapterProgressPercent(100, 100, 200), 0);
  assert.equal(chapterProgressPercent(125, 100, 200), 25);
  assert.equal(chapterProgressPercent(250, 100, 200), 100);
});

test("prefetch returns the next two available sentences", () => {
  assert.deepEqual(upcomingSegmentIndices(10, 20), [11, 12]);
  assert.deepEqual(upcomingSegmentIndices(18, 20), [19]);
  assert.deepEqual(upcomingSegmentIndices(19, 20), []);
});

