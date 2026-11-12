"""LOG_LEVEL を移植元（logging.level）と同じレベル名で書けること（#253）。

docker-entrypoint.sh は、alembic・uvicorn を引数を表示するだけの偽物に差し替えて、
実行されるコマンドを確かめる。
"""

import logging
import os
import subprocess
from pathlib import Path

import pytest

from app.core.config import Settings
from tests.conftest import make_settings

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
        ("TRACE", "trace"),
        ("FATAL", "critical"),
        ("OFF", "critical"),
        ("WARNING", "warning"),
        ("INFO", "info"),
        ("DEBUG", "debug"),
        (None, "info"),
    ],
)
def test_entrypoint_passes_log_level_uvicorn_accepts(
    tmp_path: Path, log_level: str | None, expected: str
) -> None:
    """LOG_LEVEL を小文字にし、uvicorn が受け付けない移植元のレベル名は読み替えること"""
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


@pytest.mark.parametrize(
    ("log_level", "expected"),
    [
        ("TRACE", "DEBUG"),
        ("WARN", "WARNING"),
        ("warn", "WARNING"),
        ("FATAL", "CRITICAL"),
        ("OFF", "CRITICAL"),
        ("INFO", "INFO"),
        ("error", "ERROR"),
    ],
)
def test_settings_accepts_spring_log_level_names(
    tmp_path: Path, log_level: str, expected: str
) -> None:
    """アプリの LOG_LEVEL も、Python の logging にない移植元のレベル名を読み替えること"""
    settings: Settings = make_settings(tmp_path, LOG_LEVEL=log_level)
    assert settings.log_level == expected
    assert settings.log_level in logging.getLevelNamesMapping()
