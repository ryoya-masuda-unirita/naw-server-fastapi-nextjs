"""docker-entrypoint.sh が LOG_LEVEL を uvicorn の受け付ける値にすること（#253）。

alembic・uvicorn は引数を表示するだけの偽物に差し替えて、実行されるコマンドを確かめる。
"""

import os
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENTRYPOINT = PROJECT_ROOT / "docker-entrypoint.sh"
STUB_MODE = 0o755
UVICORN_ARGS = "app.main:app_factory --factory --host 0.0.0.0 --port 8080"


def _write_stub(bin_dir: Path, name: str) -> None:
    stub = bin_dir / name
    stub.write_text(f'#!/bin/sh\necho "{name} $*"\n', encoding="utf-8")
    stub.chmod(STUB_MODE)


@pytest.mark.parametrize(
    ("log_level", "expected"),
    [
        ("WARN", "warning"),
        ("warn", "warning"),
        ("WARNING", "warning"),
        ("INFO", "info"),
        ("DEBUG", "debug"),
        (None, "info"),
    ],
)
def test_entrypoint_passes_log_level_uvicorn_accepts(
    tmp_path: Path, log_level: str | None, expected: str
) -> None:
    """LOG_LEVEL を小文字にし、移植元の WARN は uvicorn が受け付ける warning にすること"""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name in ("alembic", "uvicorn"):
        _write_stub(bin_dir, name)
    env = {"PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    if log_level is not None:
        env["LOG_LEVEL"] = log_level

    result = subprocess.run(
        ["sh", str(ENTRYPOINT)], env=env, capture_output=True, text=True, check=True
    )

    assert result.stdout.splitlines() == [
        "alembic upgrade head",
        f"uvicorn {UVICORN_ARGS} --log-level {expected}",
    ]
