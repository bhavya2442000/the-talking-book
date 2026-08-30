#!/usr/bin/env python3
"""Print a machine-readable baseline for the general book parser corpus."""

from __future__ import annotations

from argparse import ArgumentParser
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from benchmarks.general_book_parser.adapters import CurrentParserAdapter
from benchmarks.general_book_parser.runner import run_benchmark


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Optional path to a fixture manifest; defaults to the repository corpus.",
    )
    parser.add_argument(
        "--adapter",
        choices=("current", "docling"),
        default="current",
        help="Parser adapter to benchmark. Docling requires requirements-benchmark.txt.",
    )
    args = parser.parse_args()
    if args.adapter == "docling":
        from benchmarks.general_book_parser.adapters.docling_parser import (
            DoclingParserAdapter,
        )

        adapter = DoclingParserAdapter()
    else:
        adapter = CurrentParserAdapter()
    result = run_benchmark(adapter, args.manifest)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
