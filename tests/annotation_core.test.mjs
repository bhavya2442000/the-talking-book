import assert from "node:assert/strict";
import test from "node:test";

import {
  annotationAppliesToSegment,
  annotationStorageKey,
  completedAnnotationAction,
  createAnchoredAnnotation,
  sanitizeAnnotations,
} from "../static/annotation_core.mjs";

const book = {
  paragraphs: [{
    index: 0,
    page: 7,
    section: 0,
    segment_start: 0,
    segment_end: 1,
    text: "First sentence. Second sentence.",
  }],
  segments: [
    { index: 0, page: 7, section: 0, paragraph: 0, text: "First sentence." },
    { index: 1, page: 7, section: 0, paragraph: 0, text: "Second sentence." },
  ],
};

function toolEvent(action, scope, text = "") {
  return {
    type: "response.done",
    response: {
      status: "completed",
      output: [{
        type: "function_call",
        status: "completed",
        name: "annotate_book",
        call_id: "annotation-call",
        arguments: JSON.stringify({ action, scope, text }),
      }],
    },
  };
}

test("the model annotation contract accepts notes, highlights, and research", () => {
  assert.deepEqual(completedAnnotationAction(toolEvent("note", "sentence", "Important idea")), {
    action: "note",
    scope: "sentence",
    text: "Important idea",
    callId: "annotation-call",
  });
  assert.equal(completedAnnotationAction(toolEvent("highlight", "paragraph"))?.action, "highlight");
  assert.equal(completedAnnotationAction(toolEvent("research", "paragraph", "historical context"))?.action, "research");
  assert.equal(completedAnnotationAction(toolEvent("research", "paragraph", "")), null);
  assert.equal(completedAnnotationAction(toolEvent("delete", "paragraph", "anything")), null);
});

test("annotations retain their exact quote and physical PDF page", () => {
  const annotation = createAnchoredAnnotation({
    action: "note",
    scope: "paragraph",
    content: "A useful note",
    sources: [],
    book,
    segmentIndex: 1,
    id: "note-1",
    createdAt: "2026-08-27T00:00:00Z",
  });

  assert.equal(annotation.segmentIndex, 0);
  assert.equal(annotation.page, 7);
  assert.equal(annotation.quote, "First sentence. Second sentence.");
  assert.equal(annotationAppliesToSegment(annotation, book.segments[1]), true);
  assert.equal(annotationStorageKey("book-1"), "talking-book:annotations:book-1");
});

test("saved annotations remap by page and quote and sanitize source URLs", () => {
  const saved = [{
    id: "research-1",
    kind: "research",
    scope: "sentence",
    segmentIndex: 99,
    paragraphIndex: 99,
    page: 7,
    sectionIndex: 4,
    quote: "Second sentence.",
    content: "Research result",
    sources: [
      { title: "Good", url: "https://example.com/source" },
      { title: "Bad", url: "javascript:alert(1)" },
    ],
    createdAt: "2026-08-27T00:00:00Z",
  }];

  const [annotation] = sanitizeAnnotations(saved, book);
  assert.equal(annotation.segmentIndex, 1);
  assert.equal(annotation.paragraphIndex, 0);
  assert.deepEqual(annotation.sources, [{ title: "Good", url: "https://example.com/source" }]);
});
