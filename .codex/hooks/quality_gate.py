#!/usr/bin/env python3
"""Run the repository quality gate as a Codex Stop hook."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys


def repository_root() -> Path:
    output = subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=Path.cwd(),
        text=True,
    )
    return Path(output.strip())


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        payload = {}

    # Stop hooks can be called again after a blocked stop. Avoid recursively
    # blocking the continuation that is already fixing the reported failure.
    if payload.get("stop_hook_active"):
        return 0

    try:
        root = repository_root()
        environment = os.environ.copy()
        virtualenv_python = root / ".venv" / "bin" / "python"
        if virtualenv_python.is_file():
            environment["PYTHON_BIN"] = str(virtualenv_python)

        result = subprocess.run(
            ["bash", str(root / "scripts" / "check.sh")],
            cwd=root,
            env=environment,
            text=True,
            capture_output=True,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": f"Could not run the Talking Book quality gate: {error}",
                }
            )
        )
        return 0

    if result.returncode == 0:
        return 0

    output = (result.stdout + "\n" + result.stderr).strip().splitlines()
    summary = "\n".join(output[-20:])
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": (
                    "Talking Book quality gate failed. Fix the failing checks "
                    "before stopping.\n" + summary
                ),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
