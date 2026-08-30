"""Adapter for the production parser as it exists before the redesign."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.parser import extract_book
from benchmarks.general_book_parser.models import (
    ADAPTER_RESULT_SCHEMA_VERSION,
    source_span,
)


class CurrentParserAdapter:
    name = "current-parser"
    version = "1"

    def parse(self, fixture: Mapping[str, Any], pdf_path: Path) -> dict[str, Any]:
        book = extract_book(pdf_path, book_id=str(fixture["id"]))

        blocks = [
            {
                "id": f"paragraph-{paragraph['index']}",
                "text": paragraph["text"],
                "block_type": paragraph.get("block_type", "prose"),
                "reading_role": paragraph.get("reading_role", "main"),
                "narration_eligible": paragraph.get("narration_eligible", True),
                "source_spans": [
                    source_span(int(paragraph["page"]), str(paragraph["text"]))
                ],
            }
            for paragraph in book["paragraphs"]
        ]
        segments = [
            {
                "index": segment["index"],
                "text": segment["text"],
                "block_type": segment.get("block_type", "prose"),
                "reading_role": segment.get("reading_role", "main"),
                "narration_eligible": segment.get("narration_eligible", True),
                "source_spans": [
                    source_span(int(segment["page"]), str(segment["text"]))
                ],
            }
            for segment in book["segments"]
        ]

        def start(name: str) -> dict[str, Any] | None:
            index = book["reading_order"].get(name)
            if not isinstance(index, int) or not (0 <= index < len(segments)):
                return None
            segment = segments[index]
            return {
                "segment_index": index,
                "text": segment["text"],
                "source_spans": segment["source_spans"],
            }

        starts = {
            "first_eligible": start("first_eligible_segment"),
            "preface": start("preface_segment"),
            "foreword": start("preface_segment"),
            "introduction": start("introduction_segment"),
            "prologue": None,
            "main_text": start("main_text_segment"),
        }
        no_text = not blocks
        return {
            "schema_version": ADAPTER_RESULT_SCHEMA_VERSION,
            "adapter": {"name": self.name, "version": self.version},
            "fixture_id": fixture["id"],
            "status": "unsupported" if no_text else "completed",
            "book": {"title": book["title"], "author": book["author"]},
            "blocks": blocks,
            "sections": [
                {
                    "title": section["title"],
                    "page_start": section["page_start"],
                    "reading_role": section.get("reading_role", "main"),
                    "narration_eligible": section.get("narration_eligible", True),
                }
                for section in book["sections"]
            ],
            "segments": segments,
            "starts": starts,
            "uncertainties": (
                [
                    {
                        "code": "ocr_required",
                        "message": "No embedded text was extracted; this adapter has no OCR stage.",
                        "pages": list(range(1, int(book["page_count"]) + 1)),
                    }
                ]
                if no_text
                else []
            ),
        }
