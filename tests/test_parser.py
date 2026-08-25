from app.parser import LayoutLine, _lines_to_paragraphs, _sentences


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

