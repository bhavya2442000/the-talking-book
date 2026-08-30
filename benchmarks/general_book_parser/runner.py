"""Run one parser adapter against every registered fixture."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from typing import Any

from .evaluator import evaluate_fixture
from .fixtures import load_fixture_manifest
from .models import BENCHMARK_RESULT_SCHEMA_VERSION, ParserAdapter
from .synthetic_pdf import write_synthetic_pdf


def run_benchmark(
    adapter: ParserAdapter, manifest_path: str | Path | None = None
) -> dict[str, Any]:
    fixtures = load_fixture_manifest(manifest_path)
    reports: list[dict[str, Any]] = []
    with TemporaryDirectory(prefix="talking-book-benchmark-") as directory:
        root = Path(directory)
        for fixture in fixtures:
            pdf_path = write_synthetic_pdf(fixture, root / f"{fixture['id']}.pdf")
            started = perf_counter()
            result = adapter.parse(fixture, pdf_path)
            result.setdefault("metrics", {})["duration_seconds"] = round(
                perf_counter() - started, 3
            )
            reports.append(evaluate_fixture(fixture, result))

    checks = sum(report["checks"] for report in reports)
    failed = sum(report["failed"] for report in reports)
    return {
        "schema_version": BENCHMARK_RESULT_SCHEMA_VERSION,
        "adapter": {"name": adapter.name, "version": adapter.version},
        "fixture_count": len(fixtures),
        "summary": {
            "checks": checks,
            "passed": checks - failed,
            "failed": failed,
            "fixtures_with_gaps": sum(report["status"] == "gaps" for report in reports),
            "duration_seconds": round(
                sum(report["metrics"].get("duration_seconds", 0.0) for report in reports),
                3,
            ),
        },
        "fixtures": reports,
    }


def benchmark_signature(result: dict[str, Any]) -> dict[str, Any]:
    """Return the compact, reviewable form committed as a baseline."""

    return {
        "schema_version": result["schema_version"],
        "adapter": result["adapter"],
        "fixture_count": result["fixture_count"],
        "summary": {
            key: value
            for key, value in result["summary"].items()
            if key != "duration_seconds"
        },
        "fixtures": [
            {
                "fixture_id": report["fixture_id"],
                "adapter_status": report["adapter_status"],
                "uncertainty_codes": report["uncertainty_codes"],
                "checks": report["checks"],
                "passed": report["passed"],
                "failed": report["failed"],
                "issue_counts": dict(
                    sorted(Counter(issue["check"] for issue in report["issues"]).items())
                ),
            }
            for report in result["fixtures"]
        ],
    }
