"""Optional Docling extraction spike; never imported by production code."""

from __future__ import annotations

from collections.abc import Mapping
from importlib.metadata import version
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from app.parser import (
    _outline_sections,
    _reading_order,
    _section_for_page,
    _sentences,
)
from benchmarks.general_book_parser.models import ADAPTER_RESULT_SCHEMA_VERSION


_BLOCK_TYPES = {
    "caption": "caption",
    "footnote": "footnote",
    "page_footer": "footer",
    "page_header": "header",
    "section_header": "heading",
    "title": "title",
}
_NON_NARRATED_BLOCK_TYPES = {"caption", "footer", "footnote", "header"}


class DoclingParserAdapter:
    """Map Docling's document model into the engine-neutral benchmark envelope."""

    name = "docling"
    version = version("docling")

    def __init__(self) -> None:
        from docling.document_converter import DocumentConverter

        self._converter = DocumentConverter()

    @staticmethod
    def _spans(item: Any, text: str) -> list[dict[str, Any]]:
        spans: list[dict[str, Any]] = []
        for provenance in getattr(item, "prov", []) or []:
            bbox = provenance.bbox
            char_start, char_end = provenance.charspan
            spans.append(
                {
                    "page": int(provenance.page_no),
                    "bbox": [
                        float(bbox.l),
                        float(bbox.b),
                        float(bbox.r),
                        float(bbox.t),
                    ],
                    "char_start": int(char_start),
                    "char_end": int(char_end),
                }
            )
        return spans or [
            {"page": 1, "bbox": None, "char_start": 0, "char_end": len(text)}
        ]

    def parse(self, fixture: Mapping[str, Any], pdf_path: Path) -> dict[str, Any]:
        conversion = self._converter.convert(pdf_path)
        reader = PdfReader(pdf_path)
        sections = _outline_sections(reader)
        blocks: list[dict[str, Any]] = []

        for item, _level in conversion.document.iterate_items():
            text = str(getattr(item, "text", "") or "").strip()
            if not text:
                continue
            spans = self._spans(item, text)
            page = int(spans[0]["page"])
            section_index = _section_for_page(sections, page)
            if section_index is None:
                reading_role, section_eligible = "main", True
            else:
                section = sections[section_index]
                reading_role = str(section["reading_role"])
                section_eligible = bool(section["narration_eligible"])
            label = str(getattr(item, "label", "text"))
            block_type = _BLOCK_TYPES.get(label, "prose")
            blocks.append(
                {
                    "id": f"block-{len(blocks)}",
                    "text": text,
                    "block_type": block_type,
                    "reading_role": reading_role,
                    "narration_eligible": section_eligible
                    and block_type not in _NON_NARRATED_BLOCK_TYPES,
                    "section": section_index,
                    "source_spans": spans,
                }
            )

        segments: list[dict[str, Any]] = []
        for block in blocks:
            for sentence in _sentences(block["text"]):
                segments.append(
                    {
                        "index": len(segments),
                        "text": sentence,
                        "block_type": block["block_type"],
                        "reading_role": block["reading_role"],
                        "narration_eligible": block["narration_eligible"],
                        "section": block["section"],
                        "source_spans": block["source_spans"],
                    }
                )

        for section in sections:
            matching = [
                segment["index"]
                for segment in segments
                if segment["section"] == section["index"]
            ]
            section["segment_start"] = matching[0] if matching else None
            section["segment_end"] = matching[-1] if matching else None
        reading_order = _reading_order(sections, segments)

        def start(key: str) -> dict[str, Any] | None:
            index = reading_order.get(key)
            if not isinstance(index, int) or not (0 <= index < len(segments)):
                return None
            segment = segments[index]
            return {
                "segment_index": index,
                "text": segment["text"],
                "source_spans": segment["source_spans"],
            }

        no_text = not blocks
        metadata = reader.metadata or {}
        return {
            "schema_version": ADAPTER_RESULT_SCHEMA_VERSION,
            "adapter": {"name": self.name, "version": self.version},
            "fixture_id": fixture["id"],
            "status": "unsupported" if no_text else "completed",
            "book": {
                "title": str(metadata.get("/Title") or fixture["id"]),
                "author": str(metadata.get("/Author") or "") or None,
            },
            "blocks": blocks,
            "sections": [
                {
                    "title": section["title"],
                    "page_start": section["page_start"],
                    "reading_role": section["reading_role"],
                    "narration_eligible": section["narration_eligible"],
                }
                for section in sections
            ],
            "segments": segments,
            "starts": {
                "first_eligible": start("first_eligible_segment"),
                "preface": start("preface_segment"),
                "foreword": start("preface_segment"),
                "introduction": start("introduction_segment"),
                "prologue": None,
                "main_text": start("main_text_segment"),
            },
            "uncertainties": (
                [
                    {
                        "code": "ocr_failed",
                        "message": "Docling returned no readable text blocks.",
                        "pages": list(range(1, len(reader.pages) + 1)),
                    }
                ]
                if no_text
                else []
            ),
        }
