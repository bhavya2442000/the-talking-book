"""Small on-disk JSON store for parsed books."""

from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any
import json


class BookStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def list(self) -> list[dict[str, Any]]:
        books: list[dict[str, Any]] = []
        for path in sorted(self.directory.glob("*.json")):
            try:
                book = self._load_path(path)
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            books.append(
                {
                    key: book.get(key)
                    for key in (
                        "id",
                        "title",
                        "author",
                        "page_count",
                        "word_count",
                        "section_count",
                        "paragraph_count",
                        "segment_count",
                    )
                }
            )
        return books

    def get(self, book_id: str) -> dict[str, Any] | None:
        with self._lock:
            if book_id in self._cache:
                return self._cache[book_id]
        for path in self.directory.glob("*.json"):
            try:
                book = self._load_path(path)
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            if book.get("id") == book_id:
                return book
        return None

    def save(self, book: dict[str, Any]) -> Path:
        book_id = str(book["id"])
        path = self.directory / f"{book_id}.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(book, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)
        with self._lock:
            self._cache[book_id] = book
        return path

    def _load_path(self, path: Path) -> dict[str, Any]:
        resolved = str(path.resolve())
        with self._lock:
            cached = self._cache.get(resolved)
            if cached is not None:
                return cached
        book = json.loads(path.read_text(encoding="utf-8"))
        with self._lock:
            self._cache[resolved] = book
            if book.get("id"):
                self._cache[str(book["id"])] = book
        return book

