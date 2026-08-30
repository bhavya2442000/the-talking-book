"""Load and validate permitted synthetic benchmark fixture specifications."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DEFAULT_MANIFEST = (
    Path(__file__).resolve().parents[2]
    / "tests"
    / "fixtures"
    / "general_book_parser"
    / "manifest.json"
)


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Fixture JSON must contain an object: {path}")
    return value


def _validate_fixture(fixture: dict[str, Any], path: Path) -> None:
    required = {"schema_version", "id", "license", "document", "expectations"}
    missing = sorted(required - fixture.keys())
    if missing:
        raise ValueError(f"{path} is missing fields: {', '.join(missing)}")
    if fixture["schema_version"] != 1:
        raise ValueError(f"Unsupported fixture schema in {path}")
    if fixture["license"].get("redistributable") is not True:
        raise ValueError(f"Fixture must be explicitly redistributable: {path}")
    document = fixture["document"]
    if not isinstance(document.get("pages"), list) or not document["pages"]:
        raise ValueError(f"Fixture must define at least one synthetic page: {path}")
    for page in document["pages"]:
        if int(page.get("number", 0)) < 1:
            raise ValueError(f"Fixture page numbers must be positive: {path}")


def load_fixture_manifest(path: str | Path | None = None) -> list[dict[str, Any]]:
    """Return validated fixtures in stable manifest order."""

    manifest_path = Path(path) if path else DEFAULT_MANIFEST
    manifest = _read_json(manifest_path)
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported fixture-manifest schema version")
    entries = manifest.get("fixtures")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Fixture manifest must register at least one fixture")

    fixtures: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in entries:
        fixture_path = (manifest_path.parent / entry["path"]).resolve()
        fixture = _read_json(fixture_path)
        _validate_fixture(fixture, fixture_path)
        if fixture["id"] != entry["id"]:
            raise ValueError(f"Manifest id does not match {fixture_path}")
        if fixture["id"] in seen:
            raise ValueError(f"Duplicate fixture id: {fixture['id']}")
        fixture["_path"] = str(fixture_path)
        fixtures.append(fixture)
        seen.add(fixture["id"])
    return fixtures
