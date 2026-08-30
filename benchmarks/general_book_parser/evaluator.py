"""Compare adapter output with immutable, engine-neutral expectations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .models import validate_adapter_result


def _pages(item: Mapping[str, Any]) -> list[int]:
    return [int(span["page"]) for span in item.get("source_spans", [])]


def _issue(check: str, subject: str, expected: Any, actual: Any) -> dict[str, Any]:
    return {
        "check": check,
        "subject": subject,
        "expected": expected,
        "actual": actual,
    }


def evaluate_fixture(
    fixture: Mapping[str, Any], result: Mapping[str, Any]
) -> dict[str, Any]:
    """Return benchmark gaps without treating known parser gaps as test errors."""

    validate_adapter_result(result)
    expectations = fixture["expectations"]
    issues: list[dict[str, Any]] = []
    checks = 0
    blocks = result["blocks"]

    if "status" in expectations:
        checks += 1
        if result["status"] != expectations["status"]:
            issues.append(
                _issue("adapter_status", "fixture", expectations["status"], result["status"])
            )

    for expected in expectations.get("blocks", []):
        text = expected["text"]
        matches = [block for block in blocks if block["text"] == text]
        present = expected.get("present", True)
        checks += 1
        if present != bool(matches):
            issues.append(_issue("block_presence", text, present, bool(matches)))
            continue
        if not matches:
            continue
        actual = matches[0]
        for field in ("block_type", "reading_role", "narration_eligible"):
            if field not in expected:
                continue
            checks += 1
            if actual.get(field) != expected[field]:
                issues.append(
                    _issue(f"block_{field}", text, expected[field], actual.get(field))
                )
        if "pages" in expected:
            checks += 1
            if _pages(actual) != expected["pages"]:
                issues.append(_issue("block_pages", text, expected["pages"], _pages(actual)))

    actual_positions = {block["text"]: index for index, block in enumerate(blocks)}
    expected_order = expectations.get("reading_order", [])
    if expected_order:
        checks += 1
        positions = [actual_positions.get(text) for text in expected_order]
        ordered = all(position is not None for position in positions) and positions == sorted(
            positions
        )
        if not ordered:
            issues.append(_issue("reading_order", "blocks", expected_order, positions))

    sections = {section["title"]: section for section in result["sections"]}
    for expected in expectations.get("sections", []):
        title = expected["title"]
        actual = sections.get(title)
        checks += 1
        if actual is None:
            issues.append(_issue("section_presence", title, True, False))
            continue
        for field in ("reading_role", "narration_eligible", "page_start"):
            if field not in expected:
                continue
            checks += 1
            if actual.get(field) != expected[field]:
                issues.append(
                    _issue(f"section_{field}", title, expected[field], actual.get(field))
                )

    for name, expected in expectations.get("starts", {}).items():
        actual = result["starts"].get(name)
        checks += 1
        actual_text = actual.get("text") if actual else None
        if actual_text != expected:
            issues.append(_issue("start_text", name, expected, actual_text))

    for expected in expectations.get("spans", []):
        text = expected["text"]
        candidates = [
            item
            for item in [*result["blocks"], *result["segments"]]
            if item["text"] == text
        ]
        checks += 1
        actual_pages = _pages(candidates[0]) if candidates else None
        if actual_pages != expected["pages"]:
            issues.append(_issue("source_span_pages", text, expected["pages"], actual_pages))

    bbox_required = expectations.get("bbox_required", False)
    if bbox_required:
        narrated = [block for block in blocks if block.get("narration_eligible", True)]
        spans = [span for block in narrated for span in block.get("source_spans", [])]
        checks += 1
        coverage = (
            sum(span.get("bbox") is not None for span in spans) / len(spans) if spans else 0.0
        )
        if coverage < 1.0:
            issues.append(_issue("bbox_coverage", "narrated_blocks", 1.0, coverage))

    uncertainty_codes = {item["code"] for item in result["uncertainties"]}
    for code in expectations.get("uncertainties", []):
        checks += 1
        if code not in uncertainty_codes:
            issues.append(_issue("uncertainty", code, True, False))

    return {
        "fixture_id": fixture["id"],
        "status": "pass" if not issues else "gaps",
        "adapter_status": result["status"],
        "uncertainty_codes": sorted(uncertainty_codes),
        "metrics": result.get("metrics", {}),
        "checks": checks,
        "passed": checks - len(issues),
        "failed": len(issues),
        "issues": issues,
    }
