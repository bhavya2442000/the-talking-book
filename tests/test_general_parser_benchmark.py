import json
from pathlib import Path

import pdfplumber
import pytest

from benchmarks.general_book_parser.adapters import CurrentParserAdapter
from benchmarks.general_book_parser.fixtures import load_fixture_manifest
from benchmarks.general_book_parser.models import validate_adapter_result
from benchmarks.general_book_parser.runner import benchmark_signature, run_benchmark
from benchmarks.general_book_parser.synthetic_pdf import write_synthetic_pdf


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = ROOT / "tests" / "fixtures"
BASELINE = (
    ROOT
    / "benchmarks"
    / "general_book_parser"
    / "baselines"
    / "current_parser.json"
)


@pytest.fixture(scope="module")
def benchmark_result() -> dict:
    return run_benchmark(CurrentParserAdapter())


def test_manifest_registers_existing_fixture_and_layout_variants() -> None:
    fixtures = load_fixture_manifest()

    assert [fixture["id"] for fixture in fixtures] == [
        "outline_and_layout_risks",
        "foreword_prologue_structure",
        "unbookmarked_cross_page_prose",
        "two_column_textbook",
        "image_only_scanned_page",
    ]
    existing = fixtures[0]
    legacy = json.loads(
        (FIXTURE_ROOT / "extraction_golden.json").read_text(encoding="utf-8")
    )
    assert Path(existing["_path"]).parent.joinpath(existing["derived_from"]).resolve() == (
        FIXTURE_ROOT / "extraction_golden.json"
    ).resolve()
    assert {
        section["title"] for section in existing["document"]["outline"]
    } == {section["title"] for section in legacy["sections"]}
    assert all(fixture["license"]["redistributable"] for fixture in fixtures)


def test_adapter_contract_rejects_incomplete_results() -> None:
    with pytest.raises(ValueError, match="missing fields"):
        validate_adapter_result({"schema_version": 1})


def test_current_adapter_reports_raster_only_page_requires_ocr(tmp_path: Path) -> None:
    fixture = next(
        fixture
        for fixture in load_fixture_manifest()
        if fixture["id"] == "image_only_scanned_page"
    )
    pdf_path = write_synthetic_pdf(fixture, tmp_path / "scan.pdf")

    with pdfplumber.open(pdf_path) as pdf:
        assert pdf.pages[0].images
        assert not pdf.pages[0].extract_text()

    result = CurrentParserAdapter().parse(fixture, pdf_path)
    assert result["status"] == "unsupported"
    assert result["blocks"] == []
    assert [item["code"] for item in result["uncertainties"]] == ["ocr_required"]


def test_current_parser_matches_recorded_phase_zero_baseline(
    benchmark_result: dict,
) -> None:
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))

    assert benchmark_signature(benchmark_result) == expected


def test_known_gaps_are_reported_instead_of_relaxing_expectations(
    benchmark_result: dict,
) -> None:
    issues = {
        (report["fixture_id"], issue["check"], issue["subject"])
        for report in benchmark_result["fixtures"]
        for issue in report["issues"]
    }

    assert (
        "outline_and_layout_risks",
        "source_span_pages",
        "The paragraph begins on one physical page and continues on the next "
        "without a semantic break.",
    ) in issues
    assert (
        "foreword_prologue_structure",
        "start_text",
        "prologue",
    ) in issues
    assert (
        "unbookmarked_cross_page_prose",
        "section_presence",
        "Chapter One",
    ) in issues
    assert (
        "two_column_textbook",
        "reading_order",
        "blocks",
    ) in issues
    scan_report = next(
        report
        for report in benchmark_result["fixtures"]
        if report["fixture_id"] == "image_only_scanned_page"
    )
    assert scan_report["adapter_status"] == "unsupported"
    assert scan_report["uncertainty_codes"] == ["ocr_required"]
    assert benchmark_signature(benchmark_result)["summary"] == {
        "checks": 183,
        "passed": 139,
        "failed": 44,
        "fixtures_with_gaps": 5,
    }
