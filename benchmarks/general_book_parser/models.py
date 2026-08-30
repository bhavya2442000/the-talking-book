"""Contracts shared by parser adapters and the benchmark evaluator."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any, Protocol


ADAPTER_RESULT_SCHEMA_VERSION = 1
BENCHMARK_RESULT_SCHEMA_VERSION = 1


class ParserAdapter(Protocol):
    """A replaceable parser implementation evaluated against the same PDF."""

    name: str
    version: str

    def parse(self, fixture: Mapping[str, Any], pdf_path: Path) -> dict[str, Any]:
        """Return an adapter-result envelope for one generated fixture PDF."""


def validate_adapter_result(result: Mapping[str, Any]) -> None:
    """Fail clearly when an adapter does not honor the Phase 0 envelope."""

    required = {
        "schema_version",
        "adapter",
        "fixture_id",
        "status",
        "book",
        "blocks",
        "sections",
        "segments",
        "starts",
        "uncertainties",
    }
    missing = sorted(required - result.keys())
    if missing:
        raise ValueError(f"Adapter result is missing fields: {', '.join(missing)}")
    if result["schema_version"] != ADAPTER_RESULT_SCHEMA_VERSION:
        raise ValueError("Unsupported adapter-result schema version")
    if result["status"] not in {"completed", "unsupported", "error"}:
        raise ValueError(f"Unknown adapter status: {result['status']}")
    for key in ("blocks", "sections", "segments", "uncertainties"):
        if not isinstance(result[key], list):
            raise ValueError(f"Adapter result field '{key}' must be a list")
    if not isinstance(result["starts"], Mapping):
        raise ValueError("Adapter result field 'starts' must be an object")


def source_span(page: int, text: str, bbox: list[float] | None = None) -> dict[str, Any]:
    """Create the minimum page-aware provenance record used in Phase 0."""

    return {
        "page": page,
        "bbox": bbox,
        "char_start": 0,
        "char_end": len(text),
    }
