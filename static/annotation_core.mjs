const ANNOTATION_KINDS = new Set(["note", "highlight", "research"]);
const ANNOTATION_SCOPES = new Set(["sentence", "paragraph"]);

function safeSource(source) {
  const title = String(source?.title || "Source").trim().slice(0, 200);
  const url = String(source?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return { title: title || "Source", url };
}

export function annotationStorageKey(bookId) {
  return `talking-book:annotations:${bookId}`;
}

export function completedAnnotationAction(event) {
  if (event?.type !== "response.done" || event.response?.status !== "completed") {
    return null;
  }
  const call = event.response.output?.find(
    (item) => item?.type === "function_call"
      && item.status === "completed"
      && item.name === "annotate_book",
  );
  if (!call?.call_id) return null;
  try {
    const value = JSON.parse(call.arguments || "{}");
    if (
      !value
      || Array.isArray(value)
      || typeof value !== "object"
      || Object.keys(value).some((key) => !["action", "scope", "text"].includes(key))
      || !ANNOTATION_KINDS.has(value.action)
      || !ANNOTATION_SCOPES.has(value.scope)
      || typeof value.text !== "string"
    ) return null;
    const text = value.text.trim().slice(0, 1000);
    if (["note", "research"].includes(value.action) && !text) return null;
    return {
      action: value.action,
      scope: value.scope,
      text,
      callId: call.call_id,
    };
  } catch {
    return null;
  }
}

export function createAnchoredAnnotation({
  action,
  scope,
  content,
  sources = [],
  book,
  segmentIndex,
  id,
  createdAt,
}) {
  if (!ANNOTATION_KINDS.has(action) || !ANNOTATION_SCOPES.has(scope)) return null;
  const segment = book?.segments?.[segmentIndex];
  if (!segment) return null;
  const paragraph = book.paragraphs?.[segment.paragraph];
  const paragraphScope = scope === "paragraph" && paragraph;
  return {
    id: String(id || "").slice(0, 100),
    kind: action,
    scope,
    segmentIndex: paragraphScope ? paragraph.segment_start : segmentIndex,
    paragraphIndex: segment.paragraph,
    page: segment.page,
    sectionIndex: segment.section,
    quote: String(paragraphScope ? paragraph.text : segment.text).trim(),
    content: String(content || "").trim().slice(0, 8000),
    sources: sources.map(safeSource).filter(Boolean).slice(0, 8),
    createdAt: String(createdAt || ""),
  };
}

export function resolveAnnotationAnchor(annotation, book) {
  if (!annotation || !book || !ANNOTATION_KINDS.has(annotation.kind)) return null;
  if (!ANNOTATION_SCOPES.has(annotation.scope) || !annotation.quote) return null;
  const candidates = annotation.scope === "paragraph" ? book.paragraphs : book.segments;
  let match = candidates?.find(
    (candidate) => candidate.page === annotation.page
      && String(candidate.text).trim() === annotation.quote,
  );
  match ||= candidates?.find(
    (candidate) => String(candidate.text).trim() === annotation.quote,
  );
  if (!match) return null;
  const segmentIndex = annotation.scope === "paragraph" ? match.segment_start : match.index;
  const segment = book.segments?.[segmentIndex];
  if (!segment) return null;
  return createAnchoredAnnotation({
    action: annotation.kind,
    scope: annotation.scope,
    content: annotation.content,
    sources: annotation.sources,
    book,
    segmentIndex,
    id: annotation.id,
    createdAt: annotation.createdAt,
  });
}

export function sanitizeAnnotations(value, book, maxItems = 200) {
  if (!Array.isArray(value)) return [];
  return value
    .map((annotation) => resolveAnnotationAnchor(annotation, book))
    .filter(Boolean)
    .slice(-maxItems);
}

export function annotationAppliesToSegment(annotation, segment) {
  if (!annotation || !segment) return false;
  return annotation.scope === "paragraph"
    ? annotation.paragraphIndex === segment.paragraph
    : annotation.segmentIndex === segment.index;
}
