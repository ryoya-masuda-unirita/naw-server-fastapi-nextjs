"""textData JSON・tools JSON の tools の読み込みと重ね合わせのテスト。

移植元: SecuAiGentTextDataJsonToolsTest

- SecuAiGentTextDataFileLoader → `textdata.load_text_data_document`
- SecuAiGentToolsJsonFileLoader → `textdata.load_tools_json`
- SecuAiGentChatToolsMerger → `textdata.merge_chat_tools`

移植しないもの:

- `textDataDocumentLegacyConstructorKeepsSingleToolCompatibility`: 移植元の Document の
  互換コンストラクター（Optional の単一 tool）と `tool()` の確認。Python 版は core の
  Document（`tools` のタプル）をそのまま使い、単一 tool の互換 API を持たない
- `document.tool()` の確認（同上）
- `merge(null, ...)`: Python の `merge_chat_tools` は None を受け取らない型のため、
  空のタプルで「片方が空でも重ねられる」ことを確かめる
"""

from collections.abc import Callable
from pathlib import Path

import pytest
from generative_ai_adapter.textdata import (
    SecuAiGentTextDataFailure,
    load_text_data_document,
    load_tools_json,
    merge_chat_tools,
)
from generative_ai_core.chat.models import CoreChatTool, CoreChatToolKind

WriteFixture = Callable[[Path, str], Path]


def _assert_sanitized_text_data_failure(fixture: Path, *forbidden: str) -> None:
    """textData の読み込みが失敗し、メッセージにパス・値が出ないことを確かめる。

    Parameters
    ----------
    fixture : Path
        textData JSON のパス。
    *forbidden : str
        メッセージに出てはいけない値。
    """
    with pytest.raises(SecuAiGentTextDataFailure) as error:
        load_text_data_document(str(fixture))
    message = str(error.value)
    assert str(fixture) not in message
    for value in forbidden:
        assert value not in message


def _assert_sanitized_tools_json_failure(fixture: Path) -> None:
    """tools JSON の読み込みが失敗し、メッセージにパスが出ないことを確かめる。

    Parameters
    ----------
    fixture : Path
        tools JSON のパス。
    """
    with pytest.raises(SecuAiGentTextDataFailure) as error:
        load_tools_json(str(fixture))
    assert str(fixture) not in str(error.value)


def test_parses_multiple_tools_with_mcp_authorization_and_headers(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """複数の tools と mcp の authorization・headers を読めること"""
    fixture = write_text_data_fixture(
        tmp_path,
        """
        {
          "tools": [
            { "name": "web_search" },
            {
              "name": "mcp",
              "server_label": "redacted-label",
              "server_url": "redacted-url",
              "authorization": "auth-body-fixture",
              "headers": {
                "X-Trace-Fixture": "header-value-fixture",
                " X-Mode-Fixture ": "mode-value-fixture"
              }
            }
          ]
        }
        """,
    )

    document = load_text_data_document(str(fixture))

    assert document.tools_specified is True
    assert len(document.tools) == 2
    web_search, mcp = document.tools
    assert web_search.kind == CoreChatToolKind.WEB_SEARCH
    assert mcp.kind == CoreChatToolKind.MCP
    assert mcp.require_approval == "never"
    assert mcp.authorization == "auth-body-fixture"
    assert mcp.headers["X-Trace-Fixture"] == "header-value-fixture"
    assert mcp.headers["X-Mode-Fixture"] == "mode-value-fixture"
    assert " X-Mode-Fixture " not in mcp.headers


def test_empty_tools_array_is_specified_and_suppresses_fallback(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """空の tools 配列は「指定あり」で tools が空になること"""
    fixture = write_text_data_fixture(tmp_path, '{"tools":[]}')

    document = load_text_data_document(str(fixture))

    assert document.tools_specified is True
    assert document.tools == ()


def test_parses_mcp_tool_without_optional_authorization_or_headers(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """headers が null の mcp を読めること"""
    fixture = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "require_approval":"never","authorization":"BearerToken auth-body-fixture","headers":null}]}
        """,
    )

    document = load_text_data_document(str(fixture))

    assert len(document.tools) == 1
    tool = document.tools[0]
    assert tool.is_mcp is True
    assert tool.require_approval == "never"
    assert tool.authorization == "BearerToken auth-body-fixture"
    assert dict(tool.headers) == {}


def test_merger_allows_empty_input_and_preserves_whole_tool_identity() -> None:
    """片方が空でも重ねられ、tool がそのまま残ること"""
    merged = merge_chat_tools((), [CoreChatTool.web_search()])

    assert merged == [CoreChatTool.web_search()]


def test_identical_duplicate_tools_dedupe_and_conflicting_duplicates_fail_closed(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """同じ tool の重複は 1 つにし、中身の違う重複は失敗にすること"""
    duplicate_fixture = write_text_data_fixture(
        tmp_path, '{"tools":[{"name":"web_search"},{"name":"web_search"}]}'
    )

    document = load_text_data_document(str(duplicate_fixture))

    assert document.tools == (CoreChatTool.web_search(),)

    conflict_fixture = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[
          {"name":"mcp","server_label":"redacted-label","server_url":"redacted-url"},
          {"name":"mcp","server_label":"redacted-label","server_url":"other-redacted-url"}
        ]}
        """,
    )

    _assert_sanitized_text_data_failure(conflict_fixture, "other-redacted-url")


def test_duplicate_json_keys_fail_closed_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """JSON のキーの重複は値を出さずに失敗にすること"""
    duplicate_top_level_tools = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[],"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token","authorization":"fixture-auth-token"}]}
        """,
    )
    duplicate_inside_tool = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token","server_url":"alternate-fixture-url-token"}]}
        """,
    )

    _assert_sanitized_text_data_failure(
        duplicate_top_level_tools,
        "fixture-label-token",
        "fixture-url-token",
        "fixture-auth-token",
    )
    _assert_sanitized_text_data_failure(
        duplicate_inside_tool,
        "fixture-label-token",
        "fixture-url-token",
        "alternate-fixture-url-token",
    )
    _assert_sanitized_tools_json_failure(duplicate_top_level_tools)
    _assert_sanitized_tools_json_failure(duplicate_inside_tool)


@pytest.mark.parametrize(
    "json_text",
    [
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "require_approval":"always"}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "authorization":"Bearer [REDACTED]"}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "authorization":"line\\nvalue"}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"Authorization":"header-value-fixture"}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{" Authorization ":"header-value-fixture"}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X-Trace":"header-value-fixture"," X-Trace ":"other-value"}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X-Trace-Fixture":"header-value-fixture","x-trace-fixture":"other-value"}}]}
        """,
        '{"tools":[{"name":"web_search","authorization":"auth-body-fixture"}]}',
    ],
)
def test_rejects_unsupported_approval_and_unsafe_authorization_or_headers(
    tmp_path: Path, write_text_data_fixture: WriteFixture, json_text: str
) -> None:
    """未対応の承認・危険な authorization・headers を値を出さずに拒否すること"""
    fixture = write_text_data_fixture(tmp_path, json_text)

    _assert_sanitized_text_data_failure(
        fixture, "[REDACTED]", "auth-body-fixture", "header-value-fixture"
    )


@pytest.mark.parametrize(
    "json_text",
    [
        '{"tools":null}',
        '{"tools":{}}',
        '{"tools":[null]}',
        '{"tools":[{}]}',
        '{"tools":[{"name":1}]}',
        '{"tools":[{"name":"unknown"}]}',
        '{"tools":[{"name":"web_search","extra":true}]}',
        """
        {"tools":[{"name":"mcp","server_label":"","server_url":"redacted-url"}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"line\\nvalue","server_url":"redacted-url"}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":""}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "extra":true}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":[]}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"":"header-value-fixture"}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X\\nTrace":"header-value-fixture"}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X-Trace-Fixture":1}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X-Trace-Fixture":""}}]}
        """,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "headers":{"X-Trace-Fixture":"line\\nvalue"}}]}
        """,
    ],
)
def test_rejects_invalid_tools_shapes_and_values_with_sanitized_failure(
    tmp_path: Path, write_text_data_fixture: WriteFixture, json_text: str
) -> None:
    """不正な形・値の tools を値を出さずに拒否すること"""
    fixture = write_text_data_fixture(tmp_path, json_text)

    _assert_sanitized_text_data_failure(
        fixture, "redacted-label", "redacted-url", "other-redacted-url"
    )


@pytest.mark.parametrize("json_text", ['{"messages":[]}', '{"attachmentFiles":[]}'])
def test_forbidden_messages_and_attachment_files_remain_rejected(
    tmp_path: Path, write_text_data_fixture: WriteFixture, json_text: str
) -> None:
    """messages・attachmentFiles のキーを拒否すること"""
    fixture = write_text_data_fixture(tmp_path, json_text)

    _assert_sanitized_text_data_failure(fixture)


def test_tools_json_loader_requires_top_level_object_with_only_tools(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """tools JSON はトップレベルが tools だけのオブジェクトであること"""
    valid_fixture = write_text_data_fixture(tmp_path, '{"tools":[]}')

    assert load_tools_json(str(valid_fixture)) == ()

    for json_text in (
        "[]",
        "true",
        "{}",
        '{"tools":[],"extra":true}',
        '{"messages":[],"tools":[]}',
        '{"tools":[]} {"tools":[]}',
    ):
        fixture = write_text_data_fixture(tmp_path, json_text)

        _assert_sanitized_tools_json_failure(fixture)
