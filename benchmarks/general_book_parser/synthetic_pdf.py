"""Generate small, deterministic, copyright-safe PDFs from fixture JSON."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from pypdf import PdfWriter
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
)


PAGE_WIDTH = 612
PAGE_HEIGHT = 792

_BITMAP_GLYPHS = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
}


def _pdf_text(value: str) -> bytes:
    escaped = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return escaped.encode("latin-1")


def _page_content(lines: list[Mapping[str, Any]]) -> bytes:
    commands: list[bytes] = []
    for line in lines:
        font = b"/F2" if line.get("font") == "bold" else b"/F1"
        size = float(line.get("size", 12.0))
        x = float(line.get("x", 72.0))
        y = float(line.get("y", 680.0))
        commands.append(
            b"BT "
            + font
            + f" {size:g} Tf {x:g} {y:g} Td (".encode()
            + _pdf_text(str(line["text"]))
            + b") Tj ET"
        )
    return b"\n".join(commands)


def _raster_text_image(lines: list[str]) -> tuple[int, int, bytes]:
    """Render a tiny fixed bitmap font without adding an image dependency."""

    width, height, scale = 800, 400, 8
    pixels = bytearray([255]) * (width * height)
    origin_x, origin_y = 50, 50
    advance_x, advance_y = 6 * scale, 10 * scale
    for line_index, text in enumerate(lines):
        for char_index, character in enumerate(text.upper()):
            if character == " ":
                continue
            glyph = _BITMAP_GLYPHS.get(character)
            if glyph is None:
                raise ValueError(f"Unsupported synthetic bitmap character: {character}")
            left = origin_x + char_index * advance_x
            top = origin_y + line_index * advance_y
            for row_index, row in enumerate(glyph):
                for column_index, bit in enumerate(row):
                    if bit != "1":
                        continue
                    pixel_x = left + column_index * scale
                    pixel_y = top + row_index * scale
                    for y in range(pixel_y, pixel_y + scale):
                        start = y * width + pixel_x
                        pixels[start : start + scale] = bytes([0]) * scale
    return width, height, bytes(pixels)


def write_synthetic_pdf(fixture: Mapping[str, Any], destination: Path) -> Path:
    """Materialize one fixture so every adapter receives identical PDF bytes."""

    document = fixture["document"]
    page_specs = {int(page["number"]): page for page in document["pages"]}
    outline = document.get("outline", [])
    max_page = max(
        max(page_specs),
        max((int(item["page"]) for item in outline), default=1),
    )

    writer = PdfWriter()
    font_regular = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
    )
    font_bold = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica-Bold"),
            }
        )
    )

    for page_number in range(1, max_page + 1):
        page = writer.add_blank_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        resources = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {NameObject("/F1"): font_regular, NameObject("/F2"): font_bold}
                )
            }
        )
        page[NameObject("/Resources")] = resources
        page_spec = page_specs.get(page_number, {})
        content_bytes = _page_content(page_spec.get("lines", []))
        raster_lines = page_spec.get("raster_lines", [])
        if raster_lines:
            width, height, pixels = _raster_text_image(raster_lines)
            image = DecodedStreamObject()
            image.set_data(pixels)
            image.update(
                {
                    NameObject("/Type"): NameObject("/XObject"),
                    NameObject("/Subtype"): NameObject("/Image"),
                    NameObject("/Width"): NumberObject(width),
                    NameObject("/Height"): NumberObject(height),
                    NameObject("/ColorSpace"): NameObject("/DeviceGray"),
                    NameObject("/BitsPerComponent"): NumberObject(8),
                }
            )
            resources[NameObject("/XObject")] = DictionaryObject(
                {NameObject("/Im1"): writer._add_object(image)}
            )
            content_bytes += b"\nq 540 0 0 270 36 450 cm /Im1 Do Q"
        content = DecodedStreamObject()
        content.set_data(content_bytes)
        page[NameObject("/Contents")] = writer._add_object(content)

    parents: dict[int, Any] = {}
    for item in outline:
        level = int(item.get("level", 0))
        parent = parents.get(level - 1) if level else None
        reference = writer.add_outline_item(
            str(item["title"]), int(item["page"]) - 1, parent=parent
        )
        parents[level] = reference
        for deeper in [depth for depth in parents if depth > level]:
            del parents[deeper]

    writer.add_metadata(
        {
            "/Title": str(document.get("title", fixture["id"])),
            "/Author": str(document.get("author", "Synthetic fixture")),
        }
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as stream:
        writer.write(stream)
    return destination
