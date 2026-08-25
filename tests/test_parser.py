import json
from pathlib import Path

from app.parser import (
    LayoutLine,
    _layout_lines,
    _lines_to_paragraphs,
    _reading_order,
    _section_reading_metadata,
    _sentences,
)


GOLDEN_FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "extraction_golden.json").read_text(
        encoding="utf-8"
    )
)


def line(text: str, top: float, x0: float = 72.0, size: float = 14.4) -> LayoutLine:
    return LayoutLine(
        text=text,
        top=top,
        bottom=top + size,
        x0=x0,
        x1=540.0,
        font_size=size,
    )


def test_indented_line_starts_a_new_paragraph() -> None:
    lines = [
        line("The first paragraph starts here and continues across", 100),
        line("another visual line before it ends.", 117),
        line("A new indented paragraph begins here and", 134, x0=86.4),
        line("continues on the normal left margin.", 151),
    ]

    assert _lines_to_paragraphs(lines) == [
        "The first paragraph starts here and continues across another visual line before it ends.",
        "A new indented paragraph begins here and continues on the normal left margin.",
    ]


def test_large_vertical_gap_starts_a_new_paragraph() -> None:
    lines = [
        line("One sufficiently long body line establishes the layout baseline.", 100),
        line("This line remains in the same paragraph.", 117),
        line("This paragraph follows a visible vertical gap.", 150),
    ]

    assert len(_lines_to_paragraphs(lines)) == 2


def test_wrap_hyphen_is_removed() -> None:
    lines = [
        line("A para-", 100),
        line("graph can wrap a hyphenated word.", 117),
    ]

    assert _lines_to_paragraphs(lines) == ["A paragraph can wrap a hyphenated word."]


def test_sentence_segmentation_handles_abbreviation() -> None:
    result = _sentences("Dr. Smith arrived early. Then the lecture began.")
    assert result == ["Dr. Smith arrived early.", "Then the lecture began."]


def test_golden_outline_sections_have_expected_reading_metadata() -> None:
    for case in GOLDEN_FIXTURE["sections"]:
        assert _section_reading_metadata(case["title"]) == (
            case["expected_role"],
            case["expected_narration_eligible"],
        )


def test_golden_outline_exposes_preface_and_main_text_starts() -> None:
    sections = []
    segments = []
    for index, case in enumerate(GOLDEN_FIXTURE["sections"]):
        role, eligible = _section_reading_metadata(case["title"])
        sections.append(
            {
                "index": index,
                "level": case["level"],
                "reading_role": role,
                "narration_eligible": eligible,
                "segment_start": index,
            }
        )
        segments.append(
            {
                "index": index,
                "page": case["page"],
                "reading_role": role,
                "narration_eligible": eligible,
            }
        )

    assert _reading_order(sections, segments) == GOLDEN_FIXTURE[
        "expected_reading_order"
    ]
    assert [segment["page"] for segment in segments] == [
        case["page"] for case in GOLDEN_FIXTURE["sections"]
    ]


def test_golden_fixture_covers_the_known_extraction_risks() -> None:
    assert {case["type"] for case in GOLDEN_FIXTURE["risk_cases"]} == {
        "edge_page_number",
        "running_header",
        "caption",
        "cross_page_paragraph",
    }


def test_edge_page_number_fixture_is_removed_before_paragraph_building() -> None:
    page_number = next(
        case
        for case in GOLDEN_FIXTURE["risk_cases"]
        if case["type"] == "edge_page_number"
    )

    class FakePage:
        height = 792

        def extract_text_lines(self, **_kwargs):
            return [
                {
                    "text": page_number["text"],
                    "top": 20,
                    "bottom": 32,
                    "x0": 300,
                    "x1": 312,
                    "chars": [{"size": 12}],
                },
                {
                    "text": "A synthetic body line remains readable.",
                    "top": 100,
                    "bottom": 112,
                    "x0": 72,
                    "x1": 400,
                    "chars": [{"size": 12}],
                },
            ]

    assert [line.text for line in _layout_lines(FakePage())] == [
        "A synthetic body line remains readable."
    ]
