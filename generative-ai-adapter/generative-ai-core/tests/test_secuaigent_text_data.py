"""移植元 CoreSecuAiGentTextDataTest の移植。

移植元の CoreSecuAiGentTextDataOverlay（ドキュメントの上書き）は Python 版に
ないため、overlay の検証は対象外。
"""

from pathlib import Path

import pytest
from generative_ai_core.provider.clients.secuaigent import text_data
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataDocument,
    CoreSecuAiGentTextDataFailure,
    CoreSecuAiGentTextDataLoader,
)

COMPLETE_DOCUMENT = """
{"credential":{"url":"https://example.invalid","tenantId":"tenant"},
"accessToken":"token","deployName":"model","messageId":"message",
"additionalPrompt":"prompt","temperature":0.5,"maxTokens":12,
"reasoning_effort":"low","verbosity":"high","createLibrary":true,
"streamfilepath":"stream","tools":[]}
"""
SENSITIVE_DOCUMENT = """
{"credential":{"url":"https://secret.invalid","tenantId":"tenant-secret"},
"accessToken":"token-secret","streamfilepath":"secret-path",
"additionalPrompt":"secret-prompt","tools":[
  {"name":"web_search"},
  {"name":"mcp","server_label":"safe-label","server_url":"safe-url",
   "authorization":"auth-secret","headers":{"X-Trace":"header-secret"}}]}
"""
MULTIPLE_TOOLS_DOCUMENT = """
{"tools":[{"name":"web_search"},{"name":"web_search"},
{"name":"mcp","server_label":"label","server_url":"url",
"require_approval":"never","authorization":"BearerToken value",
"headers":{" X-Trace ":" trace "}}]}
"""
MCP_PREFIX = '{"tools":[{"name":"mcp","server_label":"label","server_url":"url"'
INVALID_DOCUMENTS = [
    "[]",
    "{",
    '{"unknown":1}',
    '{"credential":1}',
    '{"credential":{"unknown":1}}',
    '{"accessToken":1}',
    '{"accessToken":"Bearer raw"}',
    '{"temperature":-1}',
    '{"temperature":2}',
    '{"temperature":"x"}',
    '{"maxTokens":0}',
    '{"maxTokens":1.5}',
    '{"maxTokens":"x"}',
    '{"createLibrary":"yes"}',
    '{"tools":[{"apiKey":"raw"}]}',
]
INVALID_TOOLS = [
    '{"tools":null}',
    '{"tools":{}}',
    '{"tools":[null]}',
    '{"tools":[{}]}',
    '{"tools":[{"name":1}]}',
    '{"tools":[{"name":"unknown"}]}',
    '{"tools":[{"name":"web_search","extra":true}]}',
    '{"tools":[{"name":"mcp","server_label":"","server_url":"url"}]}',
    '{"tools":[{"name":"mcp","server_label":"line\\nvalue","server_url":"url"}]}',
    MCP_PREFIX + ',"require_approval":"always"}]}',
    MCP_PREFIX + ',"authorization":"Bearer secret"}]}',
    MCP_PREFIX + ',"headers":[]}]}',
    MCP_PREFIX + ',"headers":{"Authorization":"secret"}}]}',
    MCP_PREFIX + ',"headers":{"X":"a"," x ":"b"}}]}',
    MCP_PREFIX + ',"headers":{"X":1}}]}',
    MCP_PREFIX + ',"headers":{"X":""}}]}',
    MCP_PREFIX + '},{"name":"mcp","server_label":"label","server_url":"two"}]}',
]
INVALID_JSON = [
    '{"streamfilepath":[]}',
    '{"streamfilepath":"a\\npath"}',
    '{"tools":[],"tools":[]}',
    "{} {}",
    "true",
]


def _write(directory: Path, name: str, content: str) -> str:
    """JSON ファイルを作り、パスを返す。

    Parameters
    ----------
    directory : Path
        作る場所。
    name : str
        ファイル名。
    content : str
        中身。

    Returns
    -------
    str
        作ったファイルのパス。
    """
    path = directory / name
    path.write_text(content, encoding="utf-8")
    return str(path)


def test_canonical_text_data_contract_exists() -> None:
    """textData のドキュメントが定義されていること"""
    assert text_data.CoreSecuAiGentTextDataDocument is not None


def test_loads_empty_and_complete_documents(tmp_path: Path) -> None:
    """パスなし・空白は空のドキュメント、完全な JSON は全項目を読めること"""
    loader = CoreSecuAiGentTextDataLoader()
    assert loader.load(None) == CoreSecuAiGentTextDataDocument.empty()
    assert loader.load(" ") == CoreSecuAiGentTextDataDocument.empty()

    document = loader.load(_write(tmp_path, "complete.json", COMPLETE_DOCUMENT))

    assert document.url == "https://example.invalid"
    assert document.access_token == "token"
    assert document.tenant_id == "tenant"
    assert document.temperature == 0.5
    assert document.max_tokens == 12
    assert document.create_library is True
    assert document.tools_specified is True
    assert document.deploy_name == "model"
    nulls = _write(
        tmp_path,
        "nulls.json",
        '{"credential":null,"accessToken":null,"temperature":null,'
        '"maxTokens":null,"createLibrary":null}',
    )
    assert loader.load(nulls).access_token is None
    assert CoreSecuAiGentTextDataDocument() == CoreSecuAiGentTextDataDocument.empty()


@pytest.mark.parametrize("content", INVALID_DOCUMENTS)
def test_rejects_malformed_shapes_ranges_and_secrets(
    tmp_path: Path, content: str
) -> None:
    """形・範囲・秘密情報が不正な JSON を、固定メッセージで拒否すること"""
    path = _write(tmp_path, "invalid.json", content)

    with pytest.raises(CoreSecuAiGentTextDataFailure) as error:
        CoreSecuAiGentTextDataLoader().load(path)

    assert text_data.CODE in str(error.value)
    assert "raw" not in str(error.value)


def test_rejects_missing_file(tmp_path: Path) -> None:
    """存在しないファイルを拒否すること"""
    with pytest.raises(ValueError, match=text_data.CODE):
        CoreSecuAiGentTextDataLoader().load(str(tmp_path / "missing"))


def test_parses_tools_and_exposes_failure_contract(tmp_path: Path) -> None:
    """tools を読め、失敗が固定のコード・分類・原因なしであること"""
    document = CoreSecuAiGentTextDataLoader().load(
        _write(tmp_path, "tools.json", SENSITIVE_DOCUMENT)
    )

    failure = CoreSecuAiGentTextDataFailure()

    assert len(document.tools) == 2
    assert failure.code == "SECUAIGENT_TEXTDATA_INVALID"
    assert failure.category == "CONFIGURATION"
    assert failure.__cause__ is None


def test_never_exposes_sensitive_document_values(tmp_path: Path) -> None:
    """ドキュメントの文字列表現に、機密の値が出ないこと"""
    document = CoreSecuAiGentTextDataLoader().load(
        _write(tmp_path, "tools.json", SENSITIVE_DOCUMENT)
    )

    for secret in (
        "secret.invalid",
        "tenant-secret",
        "token-secret",
        "secret-path",
        "secret-prompt",
        "auth-secret",
        "header-secret",
    ):
        assert secret not in repr(document)


def test_preserves_whole_mcp_tools_and_deduplicates_identical_entries(
    tmp_path: Path,
) -> None:
    """MCP の tool を丸ごと保ち、同じ内容の tool は 1 つにまとめること"""
    document = CoreSecuAiGentTextDataLoader().load(
        _write(tmp_path, "multiple-tools.json", MULTIPLE_TOOLS_DOCUMENT)
    )

    assert document.tools_specified is True
    assert len(document.tools) == 2
    assert document.tools[1].authorization == "BearerToken value"
    assert document.tools[1].headers["X-Trace"] == "trace"


@pytest.mark.parametrize("content", INVALID_TOOLS)
def test_rejects_every_unsafe_tool_shape_with_one_sanitized_failure_contract(
    tmp_path: Path, content: str
) -> None:
    """安全でない tool の形をすべて、秘密情報・パスを含まない同じ失敗にすること"""
    path = _write(tmp_path, "invalid-tool.json", content)

    with pytest.raises(CoreSecuAiGentTextDataFailure) as error:
        CoreSecuAiGentTextDataLoader().load(path)

    assert "secret" not in str(error.value)
    assert path not in str(error.value)


@pytest.mark.parametrize("content", INVALID_JSON)
def test_rejects_invalid_stream_paths_and_trailing_or_duplicate_json(
    tmp_path: Path, content: str
) -> None:
    """不正な streamfilepath・末尾の余分な JSON・重複キーを拒否すること"""
    path = _write(tmp_path, "invalid-json.json", content)

    with pytest.raises(CoreSecuAiGentTextDataFailure):
        CoreSecuAiGentTextDataLoader().load(path)


def test_tools_only_entry_point_requires_exactly_the_tools_root(
    tmp_path: Path,
) -> None:
    """tools だけを読む入口が、tools だけのルートを要求すること"""
    loader = CoreSecuAiGentTextDataLoader()
    valid = _write(tmp_path, "tools-only.json", '{"tools":[{"name":"web_search"}]}')

    assert len(loader.load_tools_only(valid)) == 1
    for index, content in enumerate(["{}", "[]", '{"tools":[],"extra":true}']):
        invalid = _write(tmp_path, f"tools-only-{index}.json", content)
        with pytest.raises(CoreSecuAiGentTextDataFailure):
            loader.load_tools_only(invalid)
