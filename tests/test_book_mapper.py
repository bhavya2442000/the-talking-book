from types import SimpleNamespace

from app.book_mapper import OpeningProposal, map_book_opening


def unbookmarked_book() -> dict:
    texts = [
        (1, "A Sample Book"),
        (2, "Copyright 2026. All rights reserved."),
        (3, "Contents Preface 5 Chapter One 8"),
        (5, "Preface"),
        (5, "This preface explains why the author wrote the book."),
        (8, "Chapter One"),
        (8, "The main story begins on a quiet morning."),
        (9, "The story continues without another heading."),
    ]
    paragraphs = []
    segments = []
    for index, (page, text) in enumerate(texts):
        paragraphs.append(
            {
                "index": index,
                "page": page,
                "section": None,
                "segment_start": index,
                "segment_end": index,
                "reading_role": "main",
                "block_type": "prose",
                "narration_eligible": True,
                "text": text,
            }
        )
        segments.append(
            {
                "index": index,
                "page": page,
                "section": None,
                "paragraph": index,
                "reading_role": "main",
                "block_type": "prose",
                "narration_eligible": True,
                "text": text,
            }
        )
    return {
        "title": "A Sample Book",
        "author": "Example Author",
        "page_count": 9,
        "section_count": 0,
        "narration_segment_count": len(segments),
        "reading_order": {
            "first_eligible_segment": 0,
            "preface_segment": None,
            "introduction_segment": None,
            "main_text_segment": 0,
        },
        "sections": [],
        "paragraphs": paragraphs,
        "segments": segments,
    }


class FakeResponses:
    def __init__(self, proposals: list[OpeningProposal]):
        self.proposals = proposals
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=self.proposals.pop(0))


def test_validated_model_map_skips_debris_and_sets_opening_cursors() -> None:
    book = unbookmarked_book()
    responses = FakeResponses(
        [
            OpeningProposal.model_validate(
                {
                    "status": "ready",
                    "markers": [
                        {
                            "title": "Preface",
                            "role": "preface",
                            "pdf_page": 5,
                            "evidence": "Preface",
                            "confidence": "high",
                        },
                        {
                            "title": "Chapter One",
                            "role": "main",
                            "pdf_page": 8,
                            "evidence": "Chapter One",
                            "confidence": "high",
                        },
                    ],
                }
            )
        ]
    )

    result = map_book_opening(
        book,
        client=SimpleNamespace(responses=responses),
        model="test-model",
    )

    assert result["opening_plan"]["method"] == "model_with_source_validation"
    assert result["reading_order"] == {
        "first_eligible_segment": 3,
        "preface_segment": 3,
        "introduction_segment": None,
        "main_text_segment": 5,
    }
    assert all(not segment["narration_eligible"] for segment in result["segments"][:3])
    assert result["segments"][3]["section"] == 0
    assert result["segments"][5]["section"] == 1
    assert [section["title"] for section in result["sections"]] == [
        "Preface",
        "Chapter One",
    ]
    assert responses.calls[0]["store"] is False
    assert '<pdf_page number="9">' in responses.calls[0]["input"]


def test_hallucinated_page_evidence_is_never_applied() -> None:
    book = unbookmarked_book()
    original_order = dict(book["reading_order"])
    responses = FakeResponses(
        [
            OpeningProposal.model_validate(
                {
                    "status": "ready",
                    "markers": [
                        {
                            "title": "Chapter One",
                            "role": "main",
                            "pdf_page": 8,
                            "evidence": "Words that are not on this page",
                            "confidence": "high",
                        }
                    ],
                }
            )
        ]
    )

    result = map_book_opening(
        book,
        client=SimpleNamespace(responses=responses),
        model="test-model",
    )

    assert result["opening_plan"]["status"] == "review_required"
    assert result["reading_order"] == original_order
    assert all(segment["narration_eligible"] for segment in result["segments"])


def test_publisher_outline_is_used_without_a_model_call() -> None:
    book = unbookmarked_book()
    book["sections"] = [
        {
            "index": 0,
            "title": "Chapter One",
            "page_start": 8,
            "reading_role": "main",
            "segment_start": 5,
        }
    ]
    book["reading_order"]["main_text_segment"] = 5
    responses = FakeResponses([])

    result = map_book_opening(
        book,
        client=SimpleNamespace(responses=responses),
        model="test-model",
    )

    assert result["opening_plan"]["method"] == "pdf_outline"
    assert result["opening_plan"]["markers"][0]["segment_index"] == 5
    assert responses.calls == []


def test_missing_model_keeps_current_fallback_reading_order() -> None:
    book = unbookmarked_book()
    original_order = dict(book["reading_order"])

    result = map_book_opening(book)

    assert result["opening_plan"]["status"] == "review_required"
    assert result["opening_plan"]["warnings"] == ["model_unavailable"]
    assert result["reading_order"] == original_order
