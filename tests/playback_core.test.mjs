import assert from "node:assert/strict";
import test from "node:test";

import {
  adjacentNarrationSegmentIndex,
  bookOpeningChoice,
  chapterTransitionAfter,
  chapterProgressPercent,
  clampSegmentIndex,
  isCurrentPlaybackToken,
  isNarrationEligible,
  isValidSegmentIndex,
  libraryEntryDecision,
  paragraphStartSegment,
  readingOrderSegmentIndex,
  readerSessionMode,
  returningReaderPosition,
  savedPositionPrecedesOpening,
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

test("first session offers a verified opening before the main chapter", () => {
  const book = {
    opening_plan: { status: "ready" },
    reading_order: {
      first_eligible_segment: 2,
      preface_segment: 2,
      introduction_segment: null,
      main_text_segment: 6,
    },
    sections: [
      { index: 0, title: "Preface", segment_start: 2, narration_eligible: true },
      { index: 1, title: "How to Use This Book", segment_start: 4, narration_eligible: true },
      { index: 2, title: "Chapter One", segment_start: 6, narration_eligible: true },
    ],
    segments: Array.from({ length: 8 }, (_, index) => ({
      section: index < 4 ? 0 : index < 6 ? 1 : 2,
      narration_eligible: index >= 2,
    })),
  };

  assert.deepEqual(bookOpeningChoice(book), {
    status: "ready",
    recommendedIndex: 2,
    recommendedTitle: "Preface",
    mainIndex: 6,
    mainTitle: "Chapter One",
    openingSectionCount: 2,
    hasOpeningChoice: true,
  });
});

test("an unverified opening is reported instead of presented as certain", () => {
  const book = {
    opening_plan: { status: "review_required" },
    reading_order: { first_eligible_segment: 0, main_text_segment: 0 },
    sections: [],
    segments: [{ narration_eligible: true }],
  };

  assert.equal(bookOpeningChoice(book).status, "review_required");
  assert.equal(bookOpeningChoice(book).hasOpeningChoice, false);
});

test("saved front matter cannot hide the first-session opening choice", () => {
  assert.equal(savedPositionPrecedesOpening(0, 400, 64), true);
  assert.equal(savedPositionPrecedesOpening(64, 400, 64), false);
  assert.equal(savedPositionPrecedesOpening(319, 400, 64), false);
  assert.equal(savedPositionPrecedesOpening(-1, 400, 64), false);
});

test("localhost session modes can preview new and returning readers", () => {
  assert.equal(readerSessionMode("?session=new"), "new");
  assert.equal(readerSessionMode("?session=returning"), "returning");
  assert.equal(readerSessionMode("?session=unexpected"), "normal");
  assert.equal(readerSessionMode(""), "normal");
});

test("library entry distinguishes first-time choice from the latest returning book", () => {
  const library = [{ id: "book-a" }, { id: "book-b" }];
  assert.deepEqual(libraryEntryDecision(library), {
    kind: "choose_book",
    bookId: null,
  });
  assert.deepEqual(libraryEntryDecision(library, {
    "book-a": { started: true, updatedAt: "2026-08-20T10:00:00Z" },
    "book-b": { started: true, updatedAt: "2026-08-21T10:00:00Z" },
  }), {
    kind: "returning",
    bookId: "book-b",
  });
  assert.deepEqual(libraryEntryDecision(library, {
    "book-b": { started: true, updatedAt: "2026-08-21T10:00:00Z" },
  }, "new"), {
    kind: "choose_book",
    bookId: null,
  });
  assert.deepEqual(libraryEntryDecision([{ id: "only-book" }]), {
    kind: "first_book",
    bookId: "only-book",
  });
  assert.deepEqual(libraryEntryDecision([]), { kind: "empty", bookId: null });
});

test("returning reader position describes section, page, and progress", () => {
  const book = {
    title: "Example Book",
    sections: [{ title: "Chapter Two", segment_start: 10, segment_end: 30 }],
    segments: Array.from({ length: 31 }, (_, index) => ({
      section: 0,
      page: Math.floor(index / 3) + 1,
    })),
  };

  assert.deepEqual(returningReaderPosition(book, 20), {
    sectionTitle: "Chapter Two",
    pdfPage: 7,
    progressPercent: 50,
  });
  assert.equal(returningReaderPosition(book, 99), null);
});

test("natural narration pauses at the next readable section", () => {
  const book = {
    sections: [
      { index: 0, title: "Chapter One" },
      { index: 1, title: "Illustrations", narration_eligible: false },
      { index: 2, title: "Chapter Two" },
    ],
    segments: [
      { section: 0 },
      { section: 0 },
      { section: 1, narration_eligible: false },
      { section: 2 },
      { section: 2 },
    ],
  };

  assert.equal(chapterTransitionAfter(book, 0), null);
  assert.deepEqual(chapterTransitionAfter(book, 1), {
    completedTitle: "Chapter One",
    nextTitle: "Chapter Two",
    nextIndex: 3,
  });
  assert.equal(chapterTransitionAfter(book, 4), null);
});
