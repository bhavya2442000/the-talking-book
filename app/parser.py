"""Turn a born-digital PDF book into page-aware reading units.

PDFs normally contain positioned glyphs rather than semantic paragraphs.  This
module deliberately combines mature libraries with a small amount of
book-specific layout reasoning:

* pypdf reads metadata and the publisher-authored PDF outline.
* pdfplumber returns text lines with their coordinates and font sizes.
* pysbd performs sentence boundary detection.

The resulting JSON keeps every sentence connected to its physical PDF page,
paragraph, and outline section.  That location is the authoritative reader
cursor used later by narration and questions such as "explain this".
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from statistics import median
from typing import Any
import json
import re

import pdfplumber
import pysbd
from pypdf import PdfReader
from pypdf.generic import Destination


ProgressCallback = Callable[[int, int], None]

_SPACE_RE = re.compile(r"\s+")
_PAGE_NUMBER_RE = re.compile(r"^(?:\d{1,4}|[ivxlcdm]{1,8})$", re.IGNORECASE)
_SENTENCE_SEGMENTER = pysbd.Segmenter(language="en", clean=False)

_FRONT_MATTER_TITLES = re.compile(
    r"^(?:title page|copyright|dedication|timeline(?: of .*)?|also by|about the author)$"
)
_PREFACE_TITLES = re.compile(r"^(?:(?:the )?author'?s )?(?:preface|foreword)\b")
_INTRODUCTION_TITLES = re.compile(r"^(?:general )?introduction\b")
_BACK_MATTER_TITLES = re.compile(
    r"^(?:notes|endnotes|bibliograph(?:y|ies)|references|acknowledg(?:e)?ments?|"
    r"image credits?|index|glossary)\b"
)


@dataclass(frozen=True)
class LayoutLine:
    text: str
    top: float
    bottom: float
    x0: float
    x1: float
    font_size: float


def _clean_text(value: str) -> str:
    value = value.replace("\u00ad", "").replace("\ufeff", "")
    return _SPACE_RE.sub(" ", value).strip()


def _section_reading_metadata(title: str) -> tuple[str, bool]:
    """Classify an outline title for normal, continuous narration.

    Unknown section titles remain eligible so an unusual publisher outline
    cannot silently hide book content. More specific block-level exclusions
    are added only when a golden fixture proves the rule.
    """

    normalized = re.sub(r"[^a-z0-9]+", " ", _clean_text(title).casefold()).strip()
    if re.fullmatch(r"(?:table of )?contents", normalized):
        return "contents", False
    if _FRONT_MATTER_TITLES.fullmatch(normalized):
        return "front_matter", False
    if _PREFACE_TITLES.match(normalized):
        return "preface", True
    if _INTRODUCTION_TITLES.match(normalized):
        return "introduction", True
    if _BACK_MATTER_TITLES.match(normalized):
        return "back_matter", False
    return "main", True


def _outline_sections(reader: PdfReader) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []

    def walk(items: Iterable[Any], depth: int = 0) -> None:
        for item in items:
            if isinstance(item, list):
                walk(item, depth + 1)
                continue
            if not isinstance(item, Destination):
                continue
            try:
                page_index = reader.get_destination_page_number(item)
            except Exception:
                continue
            title = _clean_text(str(item.title))
            if title:
                reading_role, narration_eligible = _section_reading_metadata(title)
                sections.append(
                    {
                        "index": len(sections),
                        "title": title,
                        "level": depth,
                        "page_start": page_index + 1,
                        "reading_role": reading_role,
                        "narration_eligible": narration_eligible,
                    }
                )

    walk(reader.outline if isinstance(reader.outline, list) else [])
    sections.sort(key=lambda section: (section["page_start"], section["level"]))
    for index, section in enumerate(sections):
        section["index"] = index
        next_page = (
            sections[index + 1]["page_start"]
            if index + 1 < len(sections)
            else len(reader.pages) + 1
        )
        section["page_end"] = max(section["page_start"], next_page - 1)
    return sections


def _layout_lines(page: Any) -> list[LayoutLine]:
    extracted = page.extract_text_lines(strip=True, return_chars=True) or []
    result: list[LayoutLine] = []
    for raw in extracted:
        text = _clean_text(raw.get("text", ""))
        if not text:
            continue
        chars = raw.get("chars") or []
        sizes = [float(char.get("size", 0.0)) for char in chars if char.get("size")]
        font_size = median(sizes) if sizes else 0.0
        line = LayoutLine(
            text=text,
            top=float(raw.get("top", 0.0)),
            bottom=float(raw.get("bottom", raw.get("top", 0.0))),
            x0=float(raw.get("x0", 0.0)),
            x1=float(raw.get("x1", 0.0)),
            font_size=font_size,
        )
        # Running page numbers near the physical edge are navigation noise.
        if _PAGE_NUMBER_RE.fullmatch(text) and (
            line.top < 60 or line.bottom > float(page.height) - 42
        ):
            continue
        result.append(line)
    return result


def _join_line(previous: str, current: str) -> str:
    # A hyphen followed by a lowercase letter is normally a line-wrap hyphen.
    if previous.endswith("-") and current[:1].islower():
        return previous[:-1] + current
    return f"{previous} {current}"


def _lines_to_paragraphs(lines: list[LayoutLine]) -> list[str]:
    if not lines:
        return []

    body_candidates = [
        line for line in lines if len(line.text) >= 30 and 7 <= line.font_size <= 20
    ]
    body_font = median([line.font_size for line in body_candidates] or [12.0])
    body_left = median([line.x0 for line in body_candidates] or [lines[0].x0])
    gaps = [
        current.top - previous.top
        for previous, current in zip(lines, lines[1:])
        if 0 < current.top - previous.top < body_font * 2
    ]
    normal_gap = median(gaps or [body_font * 1.2])

    paragraphs: list[str] = []
    buffer = ""
    previous: LayoutLine | None = None

    def flush() -> None:
        nonlocal buffer
        cleaned = _clean_text(buffer)
        if cleaned:
            paragraphs.append(cleaned)
        buffer = ""

    for line in lines:
        is_heading = line.font_size >= body_font + 1.4 and len(line.text) <= 140
        gap = line.top - previous.top if previous else 0.0
        indented = line.x0 >= body_left + max(7.0, body_font * 0.55)
        large_gap = previous is not None and gap >= max(normal_gap * 1.55, body_font * 1.65)
        previous_heading = (
            previous is not None
            and previous.font_size >= body_font + 1.4
            and len(previous.text) <= 140
        )

        starts_new = bool(buffer) and (is_heading or indented or large_gap or previous_heading)
        if starts_new:
            flush()

        if is_heading:
            buffer = line.text
            flush()
        elif buffer:
            buffer = _join_line(buffer, line.text)
        else:
            buffer = line.text
        previous = line

    flush()
    return paragraphs


def _sentences(text: str) -> list[str]:
    pieces = [_clean_text(piece) for piece in _SENTENCE_SEGMENTER.segment(text)]
    pieces = [piece for piece in pieces if piece]
    return pieces or ([text] if text else [])


def _section_for_page(sections: list[dict[str, Any]], page_number: int) -> int | None:
    active: int | None = None
    for section in sections:
        if section["page_start"] <= page_number:
            active = int(section["index"])
        else:
            break
    return active


def _reading_order(
    sections: list[dict[str, Any]], segments: list[dict[str, Any]]
) -> dict[str, int | None]:
    """Return stable starting cursors without changing physical segment indexes."""

    def first_section_segment(role: str, *, prefer_nested: bool = False) -> int | None:
        candidates = [
            section for section in sections if section.get("reading_role") == role
        ]
        if prefer_nested:
            nested = [section for section in candidates if int(section.get("level", 0)) > 0]
            if nested:
                candidates = nested
        for section in candidates:
            value = section.get("segment_start")
            if isinstance(value, int):
                return value
        return None

    first_eligible = next(
        (
            int(segment["index"])
            for segment in segments
            if segment.get("narration_eligible", True)
        ),
        None,
    )
    main_text = first_section_segment("main", prefer_nested=True)
    if main_text is None and not sections:
        main_text = first_eligible

    return {
        "first_eligible_segment": first_eligible,
        "preface_segment": first_section_segment("preface"),
        "introduction_segment": first_section_segment("introduction"),
        "main_text_segment": main_text,
    }


def extract_book(
    pdf_path: str | Path,
    *,
    book_id: str | None = None,
    progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Extract a PDF into a serializable, page-aware book document."""

    path = Path(pdf_path)
    reader = PdfReader(path)
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:  # pragma: no cover - depends on encryption scheme
            raise ValueError("This PDF is encrypted and cannot be read.") from exc

    page_count = len(reader.pages)
    sections = _outline_sections(reader)
    metadata = reader.metadata or {}
    title = _clean_text(str(metadata.get("/Title") or path.stem))
    author = _clean_text(str(metadata.get("/Author") or "")) or None
    digest = sha256(path.read_bytes()).hexdigest()

    paragraphs: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []

    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            page_number = page_index + 1
            page_paragraph_start = len(paragraphs)
            page_segment_start = len(segments)
            section_index = _section_for_page(sections, page_number)
            if section_index is None:
                reading_role, narration_eligible = "main", True
            else:
                section = sections[section_index]
                reading_role = str(section["reading_role"])
                narration_eligible = bool(section["narration_eligible"])

            for text in _lines_to_paragraphs(_layout_lines(page)):
                paragraph_index = len(paragraphs)
                sentence_start = len(segments)
                for sentence in _sentences(text):
                    segments.append(
                        {
                            "index": len(segments),
                            "page": page_number,
                            "section": section_index,
                            "paragraph": paragraph_index,
                            "reading_role": reading_role,
                            "narration_eligible": narration_eligible,
                            "text": sentence,
                        }
                    )
                paragraphs.append(
                    {
                        "index": paragraph_index,
                        "page": page_number,
                        "section": section_index,
                        "segment_start": sentence_start,
                        "segment_end": len(segments) - 1,
                        "reading_role": reading_role,
                        "narration_eligible": narration_eligible,
                        "text": text,
                    }
                )

            pages.append(
                {
                    "number": page_number,
                    "paragraph_start": page_paragraph_start,
                    "paragraph_end": len(paragraphs) - 1,
                    "segment_start": page_segment_start,
                    "segment_end": len(segments) - 1,
                }
            )
            if progress:
                progress(page_number, page_count)

    for section in sections:
        matching = [
            segment["index"]
            for segment in segments
            if segment["section"] == section["index"]
        ]
        section["segment_start"] = matching[0] if matching else None
        section["segment_end"] = matching[-1] if matching else None

    word_count = sum(len(segment["text"].split()) for segment in segments)
    narration_segment_count = sum(
        bool(segment["narration_eligible"]) for segment in segments
    )
    return {
        "schema_version": 1,
        "id": book_id or digest[:16],
        "title": title,
        "author": author,
        "source_filename": path.name,
        "source_sha256": digest,
        "page_count": page_count,
        "word_count": word_count,
        "section_count": len(sections),
        "paragraph_count": len(paragraphs),
        "segment_count": len(segments),
        "narration_segment_count": narration_segment_count,
        "reading_order": _reading_order(sections, segments),
        "sections": sections,
        "pages": pages,
        "paragraphs": paragraphs,
        "segments": segments,
    }


def write_book_json(book: dict[str, Any], destination: str | Path) -> Path:
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(book, ensure_ascii=False), encoding="utf-8")
    temporary.replace(output)
    return output
