#!/usr/bin/env python3
"""Extract a PDF book and cache its structured reading index."""

from __future__ import annotations

from argparse import ArgumentParser
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.parser import extract_book, write_book_json


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/books/book.json"))
    args = parser.parse_args()

    def show_progress(current: int, total: int) -> None:
        if current == 1 or current % 25 == 0 or current == total:
            print(f"Extracting page {current}/{total}...", flush=True)

    book = extract_book(args.pdf, progress=show_progress)
    output = write_book_json(book, args.output)
    print(f"Saved: {output}")
    print(f"Title: {book['title']}")
    print(f"Pages: {book['page_count']}")
    print(f"Outline sections: {book['section_count']}")
    print(f"Paragraphs: {book['paragraph_count']}")
    print(f"Sentences: {book['segment_count']}")
    print(f"Words: {book['word_count']}")


if __name__ == "__main__":
    main()

