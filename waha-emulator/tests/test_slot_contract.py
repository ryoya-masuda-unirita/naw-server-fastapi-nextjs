"""server-local とエミュレーターの、スロット名の契約が食い違っていないことを確かめる。"""

import re
from pathlib import Path

import pytest

from waha_emulator import sessions

WAHA_CLIENT = (
    Path(__file__).resolve().parents[2]
    / "secuaigent-server-local"
    / "app"
    / "clients"
    / "waha_client.py"
)
SLOT_NAMES = [
    "SLOT_FILE",
    "SLOT_QUESTION",
    "SLOT_ATTACHMENT",
    "SLOT_HISTORY",
    "SLOT_OUTPUT",
    "SLOT_TEXTDATA",
]


def _client_slots() -> dict[str, str]:
    """server-local の waha_client.py から、スロット名の定数を読む。

    Returns
    -------
    dict[str, str]
        定数名 → スロット名。
    """
    source = WAHA_CLIENT.read_text(encoding="utf-8")
    return dict(re.findall(r'^(SLOT_[A-Z]+) = "([^"]+)"$', source, flags=re.MULTILINE))


@pytest.mark.skipif(not WAHA_CLIENT.exists(), reason="server-local がない環境")
@pytest.mark.parametrize("name", SLOT_NAMES)
def test_slot_name_matches_server_local(name: str) -> None:
    """エミュレーターのスロット名が、server-local（呼ぶ側）と同じであること"""
    assert _client_slots()[name] == getattr(sessions, name)
