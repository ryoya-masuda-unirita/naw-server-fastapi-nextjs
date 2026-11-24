"""終了時に、起動した Tika を止めること（#482）。"""

import pytest

from tests.conftest import running_emulator


async def test_lifespan_shuts_down_tika(monkeypatch: pytest.MonkeyPatch) -> None:
    """アプリの終了時に、Tika を止める呼び出しが 1 回行われること"""
    calls: list[str] = []
    monkeypatch.setattr("waha_emulator.main.shutdown_tika", lambda: calls.append("x"))
    async with running_emulator():
        assert calls == []
    assert calls == ["x"]
