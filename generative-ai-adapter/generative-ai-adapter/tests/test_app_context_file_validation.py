"""旧 RAG の質問ファイルの検証のテスト（移植元 GenerativeContextFileValidationTest）。

移植元は相対パスの存在しないファイルを使う。Python 版では作業ディレクトリに
左右されないよう、`tmp_path` の下の存在しないファイルを使う。
"""

from pathlib import Path

import pytest
from generative_ai_adapter.constants import ImageExplanationMode
from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    ProxySetting,
)
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnData, ColumnInformation, ColumnType


def test_image_explanation_context_file_must_point_to_readable_file(
    tmp_path: Path,
) -> None:
    """存在しない質問ファイルは、秘密を含まないメッセージの例外になること"""
    factory = RequestSchemaFactory(
        AccessCredential(), ProxySetting(), ImageExplanationMode.FULL_PAGE
    )
    missing = tmp_path / "missing-context-file.txt"
    data = [ColumnData.file(str(missing))]
    columns = [ColumnInformation("", ColumnType.FILE, 0)]

    with pytest.raises(RuntimeError) as exc_info:
        factory.create_request_schema_with_context(
            "safe-model", data, columns, ChatGPTParameter()
        )

    assert "api-key" not in str(exc_info.value)
    assert "provider response" not in str(exc_info.value)
