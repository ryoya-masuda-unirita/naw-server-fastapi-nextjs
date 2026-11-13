"""textData の失敗が機微な値を出さないことのテスト。

移植元: textdata/SecuAiGentTextDataObservabilityTest。
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.textdata import (
    SecuAiGentTextDataFailure,
    load_text_data_document,
)


def test_failure_message_does_not_expose_raw_path_or_restricted_values(
    tmp_path: Path, write_text_data_fixture: Callable[[Path, str], Path]
) -> None:
    """失敗のメッセージにパス・URL・テナント・秘密の値を出さず、原因も持たないこと"""
    fixture = write_text_data_fixture(
        tmp_path,
        """
        {
          "credential": {
            "url": "https://json-provider.invalid",
            "accessToken": "access-token-fixture",
            "tenantId": "tenant-fixture"
          },
          "secrets": {"proxyPassword": "restricted-value"}
        }
        """,
    )

    with pytest.raises(SecuAiGentTextDataFailure) as error:
        load_text_data_document(str(fixture))

    message = str(error.value)
    assert "SECUAIGENT_TEXTDATA_INVALID" in message
    for leaked in (
        str(fixture),
        "json-provider",
        "login-fixture",
        "tenant-fixture",
        "restricted-value",
    ):
        assert leaked not in message
    assert error.value.__cause__ is None
