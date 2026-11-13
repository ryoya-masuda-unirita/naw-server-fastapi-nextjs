"""textData JSON（プロパティ 43）・tools JSON（プロパティ 48）を App で使うテスト。

移植元: SecuAiGentTextDataJsonPathAppTest

- 移植元はリフレクションで App の genController・controller の accessCredential・
  chatTools を読む。Python 版では `App._controller`・`GenerativeAiController
  ._access_credential`・`._chat_tools` を読む
- 移植元の `write(new byte[0], 0)` は空のレコード `[]` を渡す
- 出力ファイルは `OUTPUT_DIR/<ビュー名>`（`tmp_path` の下）
"""

from collections.abc import Callable, Sequence
from pathlib import Path

from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import AccessCredential, ProxySetting
from generative_ai_adapter.textdata import SecuAiGentTextDataFailure
from generative_ai_core.chat.models import (
    CoreChatRequest,
    CoreChatResult,
    CoreChatTool,
    OutputModeHint,
)
from generative_ai_core.chat.runtime import CoreChatRuntime
from generative_ai_core.provider.model import Capability, RuntimeProviderConfiguration
from generative_ai_core.provider.runtime import CoreProviderRuntime, ExecutionContext

WriteFixture = Callable[[Path, str], Path]

MCP_JSON = """
{"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
"authorization":"auth-body-fixture","headers":{"X-Trace-Fixture":"header-value-fixture"}}]}
"""


def _configured_app(vendor_id: str, output_type: int = 2) -> App:
    """プロパティの資格情報とベンダーを設定した App を作る。

    Parameters
    ----------
    vendor_id : str
        ベンダー ID（"0"=OpenAI、"5"=SecuAiGent）。
    output_type : int, optional
        出力モード（既定は 2=回答本文だけ）。

    Returns
    -------
    App
        設定した App。
    """
    app = App()
    app.set_property(PropertyIds.URL, "https://property-provider.invalid")
    app.set_property(PropertyIds.API_KEY, "property-login")
    app.set_property(PropertyIds.MODEL_NAME, "property-deploy")
    app.set_property(PropertyIds.TENANT_ID, "property-tenant")
    app.set_property(PropertyIds.VENDOR, vendor_id)
    app.connect(output_type)
    return app


def _controller(app: App) -> GenerativeAiController:
    """App が作った controller を返す。

    Parameters
    ----------
    app : App
        before_execute を呼んだ App。

    Returns
    -------
    GenerativeAiController
        controller。

    Raises
    ------
    AssertionError
        controller がないとき。
    """
    controller = app._controller
    assert controller is not None
    return controller


def _controller_credential(app: App) -> AccessCredential:
    """controller が持つ資格情報を返す。

    Parameters
    ----------
    app : App
        before_execute を呼んだ App。

    Returns
    -------
    AccessCredential
        controller の資格情報。
    """
    return _controller(app)._access_credential


def _controller_chat_tools(app: App) -> list[CoreChatTool]:
    """controller が持つ tools を返す。

    Parameters
    ----------
    app : App
        before_execute を呼んだ App。

    Returns
    -------
    list[CoreChatTool]
        controller の tools。
    """
    return _controller(app)._chat_tools


def _controller_chat_tool(app: App) -> CoreChatTool:
    """controller が持つ先頭の tool を返す。

    Parameters
    ----------
    app : App
        before_execute を呼んだ App。

    Returns
    -------
    CoreChatTool
        先頭の tool。
    """
    return _controller_chat_tools(app)[0]


def _install_capturing_controller(app: App, captured: list[CoreChatRequest]) -> None:
    """プロバイダの呼び出しを記録する controller に差し替える。

    Parameters
    ----------
    app : App
        差し替える App。
    captured : list[CoreChatRequest]
        プロバイダが受け取ったリクエストを追加するリスト。
    """

    def handle(request: CoreChatRequest, context: ExecutionContext) -> CoreChatResult:
        """リクエストを記録して、呼ばれてはいけない回答を返す。

        Parameters
        ----------
        request : CoreChatRequest
            chat のリクエスト。
        context : ExecutionContext
            実行の文脈（使わない）。

        Returns
        -------
        CoreChatResult
            固定の回答。
        """
        captured.append(request)
        return CoreChatResult.success(
            "unexpected-provider-call", [], OutputModeHint.PLAIN_ANSWER_TEXT
        )

    runtime = CoreChatRuntime(
        CoreProviderRuntime.builder()
        .register("OpenAI", Capability.CHAT, CoreChatRequest, handle)
        .build()
    )

    def factory(configuration: RuntimeProviderConfiguration) -> CoreChatRuntime:
        """設定によらず記録用の runtime を返す。

        Parameters
        ----------
        configuration : RuntimeProviderConfiguration
            プロバイダの設定（使わない）。

        Returns
        -------
        CoreChatRuntime
            記録用の runtime。
        """
        return runtime

    app._controller = GenerativeAiController(
        AccessCredential(
            url="fixture-provider-endpoint",
            test_url="fixture-provider-test-endpoint",
            api_key="controlled-credential",
            model_name="controlled-model",
            vendor_name="OpenAI",
        ),
        ProxySetting(),
        0,
        [],
        factory,
    )


def _assert_no_provider_invocation_failure(
    app: App,
    tmp_path: Path,
    view_name: str,
    expected_code: str,
    forbidden: Sequence[str],
    expect_no_controller_construction: bool = False,
) -> str:
    """プロバイダを呼ばずに、値を出さない失敗を書くことを確かめる。

    Parameters
    ----------
    app : App
        設定した App。
    tmp_path : Path
        出力先のディレクトリ。
    view_name : str
        ビュー名（出力ファイル名）。
    expected_code : str
        出力に含まれる失敗のコード。
    forbidden : Sequence[str]
        出力に出てはいけない値。
    expect_no_controller_construction : bool, optional
        before_execute で controller を作らないことも確かめるか。

    Returns
    -------
    str
        出力ファイルの内容。
    """
    app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    app.set_view_name(view_name)

    app.before_execute()
    if expect_no_controller_construction:
        assert app._controller is None
    captured: list[CoreChatRequest] = []
    _install_capturing_controller(app, captured)
    app.write([])

    output = (tmp_path / view_name).read_text(encoding="utf-8")
    assert captured == []
    assert expected_code in output
    for value in forbidden:
        assert value not in output
    return output


def _assert_sanitized_tools_failure(
    tmp_path: Path,
    name: str,
    label: str | None,
    url: str | None,
    approval: str | None,
) -> None:
    """プロパティ 44〜47 の tools が不正なとき、値を出さない失敗を書くことを確かめる。

    Parameters
    ----------
    tmp_path : Path
        出力先のディレクトリ。
    name : str
        tools の名前（プロパティ 44）。
    label : str | None
        MCP の server_label（プロパティ 45）。
    url : str | None
        MCP の server_url（プロパティ 46）。
    approval : str | None
        MCP の require_approval（プロパティ 47）。
    """
    app = _configured_app("5")
    app.set_property(PropertyIds.CHAT_TOOLS_NAME, name)
    if label is not None:
        app.set_property(PropertyIds.CHAT_MCP_SERVER_LABEL, label)
    if url is not None:
        app.set_property(PropertyIds.CHAT_MCP_SERVER_URL, url)
    if approval is not None:
        app.set_property(PropertyIds.CHAT_MCP_REQUIRE_APPROVAL, approval)
    app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    view_name = (
        f"tools-failure-{name}-{'missing' if approval is None else approval}.txt"
    )
    app.set_view_name(view_name)

    app.before_execute()
    app.write([])

    output = (tmp_path / view_name).read_text(encoding="utf-8")
    assert "invalid_tools_input" in output
    for value in (label, url, approval):
        if value is not None:
            assert value not in output


def test_secuaigent_credential_only_json_does_not_use_json_file_path_as_stream_path(
    tmp_path: Path,
    write_text_data_fixture: WriteFixture,
    text_data_json: dict[str, str],
) -> None:
    """資格情報だけの textData で上書きし、JSON のパスを途中経過ファイルにしないこと"""
    app = _configured_app("5")
    text_data_path = write_text_data_fixture(
        tmp_path, text_data_json["credential_only"]
    )
    app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))

    app.before_execute()

    credential = _controller_credential(app)
    assert credential.url == "https://json-provider.invalid"
    assert credential.api_key == "property-login"
    assert credential.secuaigent_access_token == "access-token-fixture"
    assert credential.tenant_id == "tenant-fixture"
    assert credential.model_name == "json-deploy"
    assert credential.secuaigent_stream_file_path is None


def test_text_data_tools_and_tools_json_merge_by_whole_tool_identity(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """textData の tools と tools JSON を tool の同一性で重ねること"""
    app = _configured_app("5")
    text_data_path = write_text_data_fixture(
        tmp_path, '{"tools":[{"name":"web_search"}]}'
    )
    tools_json_path = write_text_data_fixture(tmp_path, MCP_JSON)
    app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))

    app.before_execute()

    tools = _controller_chat_tools(app)
    assert len(tools) == 2
    assert tools[0] == CoreChatTool.web_search()
    assert tools[1].is_mcp is True
    assert tools[1].authorization == "auth-body-fixture"
    assert tools[1].headers["X-Trace-Fixture"] == "header-value-fixture"


def test_text_data_tools_only_resolve_and_unsupported_provider_fails_closed(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """textData の tools だけでも解決し、SecuAiGent 以外では失敗を書くこと"""
    text_data_path = write_text_data_fixture(
        tmp_path, '{"tools":[{"name":"web_search"}]}'
    )

    secuaigent_app = _configured_app("5")
    secuaigent_app.set_property(
        PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path)
    )

    secuaigent_app.before_execute()

    assert _controller_chat_tools(secuaigent_app) == [CoreChatTool.web_search()]

    unsupported_provider_app = _configured_app("0")
    unsupported_provider_app.set_property(
        PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path)
    )
    unsupported_provider_app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    unsupported_provider_app.set_view_name("unsupported-provider-textdata-tools.txt")

    unsupported_provider_app.before_execute()
    unsupported_provider_app.write([])

    output = (tmp_path / "unsupported-provider-textdata-tools.txt").read_text(
        encoding="utf-8"
    )
    assert "unsupported_tools_provider" in output
    assert "web_search" not in output
    assert str(text_data_path) not in output


def test_identical_duplicates_dedupe_and_conflicting_duplicates_fail_closed(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """同じ tool の重複は 1 つにし、中身の違う重複は値を出さない失敗にすること"""
    dedupe_app = _configured_app("5")
    text_data_path = write_text_data_fixture(tmp_path, MCP_JSON)
    tools_json_path = write_text_data_fixture(tmp_path, MCP_JSON)
    dedupe_app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))
    dedupe_app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))

    dedupe_app.before_execute()

    assert len(_controller_chat_tools(dedupe_app)) == 1

    conflict_app = _configured_app("5", 0)
    conflict_text_data = write_text_data_fixture(tmp_path, MCP_JSON)
    conflict_tools_json = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label",
        "server_url":"different-redacted-url","authorization":"other-auth-body-fixture"}]}
        """,
    )
    conflict_app.set_property(
        PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(conflict_text_data)
    )
    conflict_app.set_property(
        PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(conflict_tools_json)
    )
    conflict_app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    conflict_app.set_view_name("tools-conflict.json")

    conflict_app.before_execute()
    conflict_app.write([])

    output = (tmp_path / "tools-conflict.json").read_text(encoding="utf-8")
    assert "invalid_tools_input" in output
    assert "auth-body-fixture" not in output
    assert "other-auth-body-fixture" not in output
    assert "different-redacted-url" not in output
    assert str(conflict_tools_json) not in output


def test_tools_json_empty_tools_suppresses_property_fallback(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """tools JSON が空の tools ならプロパティの tools に戻らないこと"""
    app = _configured_app("5")
    tools_json_path = write_text_data_fixture(tmp_path, '{"tools":[]}')
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))
    app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")

    app.before_execute()

    assert _controller_chat_tools(app) == []


def test_blank_tools_json_path_uses_property_fallback() -> None:
    """空白の tools JSON のパスはプロパティの tools を使うこと"""
    app = _configured_app("5")
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, " ")
    app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")

    app.before_execute()

    assert _controller_chat_tools(app) == [CoreChatTool.web_search()]


def test_property_fallbacks_remain_supported_when_no_json_tools_specified() -> None:
    """JSON の tools がなければプロパティの web_search・mcp を使えること"""
    web_search_app = _configured_app("5")
    web_search_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "1")

    web_search_app.before_execute()

    assert _controller_chat_tools(web_search_app) == [CoreChatTool.web_search()]

    mcp_app = _configured_app("5")
    mcp_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "mcp")
    mcp_app.set_property(PropertyIds.CHAT_MCP_SERVER_LABEL, "redacted-label")
    mcp_app.set_property(PropertyIds.CHAT_MCP_SERVER_URL, "redacted-url")
    mcp_app.set_property(PropertyIds.CHAT_MCP_REQUIRE_APPROVAL, "never")

    mcp_app.before_execute()

    string_mcp = _controller_chat_tool(mcp_app)
    assert string_mcp.is_mcp is True
    assert string_mcp.require_approval == "never"

    numeric_mcp_app = _configured_app("5")
    numeric_mcp_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "2")
    numeric_mcp_app.set_property(PropertyIds.CHAT_MCP_SERVER_LABEL, "redacted-label")
    numeric_mcp_app.set_property(PropertyIds.CHAT_MCP_SERVER_URL, "redacted-url")
    numeric_mcp_app.set_property(PropertyIds.CHAT_MCP_REQUIRE_APPROVAL, "1")

    numeric_mcp_app.before_execute()

    numeric_mcp = _controller_chat_tool(numeric_mcp_app)
    assert numeric_mcp.is_mcp is True
    assert numeric_mcp.require_approval == "never"


def test_blank_and_zero_property_values_behave_as_unspecified() -> None:
    """空白・"0" のプロパティの値は指定なしと同じになること"""
    empty_tool_app = _configured_app("5")
    empty_tool_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "0")

    empty_tool_app.before_execute()

    assert _controller_chat_tools(empty_tool_app) == []

    zero_approval_app = _configured_app("5")
    zero_approval_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "2")
    zero_approval_app.set_property(PropertyIds.CHAT_MCP_SERVER_LABEL, "redacted-label")
    zero_approval_app.set_property(PropertyIds.CHAT_MCP_SERVER_URL, "redacted-url")
    zero_approval_app.set_property(PropertyIds.CHAT_MCP_REQUIRE_APPROVAL, "0")

    zero_approval_app.before_execute()

    assert _controller_chat_tool(zero_approval_app).require_approval is None

    blank_approval_app = _configured_app("5")
    blank_approval_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "mcp")
    blank_approval_app.set_property(PropertyIds.CHAT_MCP_SERVER_LABEL, "redacted-label")
    blank_approval_app.set_property(PropertyIds.CHAT_MCP_SERVER_URL, "redacted-url")
    blank_approval_app.set_property(PropertyIds.CHAT_MCP_REQUIRE_APPROVAL, " ")

    blank_approval_app.before_execute()

    assert _controller_chat_tool(blank_approval_app).require_approval is None


def test_invalid_property_tools_fail_closed_with_sanitized_output(
    tmp_path: Path,
) -> None:
    """不正なプロパティの tools は値を出さない失敗を書くこと"""
    _assert_sanitized_tools_failure(tmp_path, "mcp", "redacted-label", None, None)
    _assert_sanitized_tools_failure(tmp_path, "mcp", None, "redacted-url", None)
    _assert_sanitized_tools_failure(
        tmp_path, "mcp", "redacted-label", "redacted-url", "always"
    )
    _assert_sanitized_tools_failure(
        tmp_path, "2", "redacted-label", "redacted-url", "2"
    )
    _assert_sanitized_tools_failure(tmp_path, "unknown", None, None, None)


def test_configured_tools_fail_closed_on_unsupported_provider_and_route_without_raw_values(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """未対応のプロバイダ・経路の tools は値を出さない失敗を書くこと"""
    unsupported_provider_app = _configured_app("0")
    tools_json_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"redacted-label","server_url":"redacted-url",
        "authorization":"auth-body-fixture"}]}
        """,
    )
    unsupported_provider_app.set_property(
        PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path)
    )
    unsupported_provider_app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    unsupported_provider_app.set_view_name("unsupported-provider-tools.txt")

    unsupported_provider_app.before_execute()
    unsupported_provider_app.write([])

    provider_output = (tmp_path / "unsupported-provider-tools.txt").read_text(
        encoding="utf-8"
    )
    assert "unsupported_tools_provider" in provider_output
    assert "auth-body-fixture" not in provider_output
    assert "redacted-url" not in provider_output
    assert str(tools_json_path) not in provider_output

    unsupported_route_app = _configured_app("5", 1)
    unsupported_route_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")
    unsupported_route_app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    unsupported_route_app.set_view_name("unsupported-route-tools.txt")

    unsupported_route_app.before_execute()
    unsupported_route_app.write([])

    route_output = (tmp_path / "unsupported-route-tools.txt").read_text(
        encoding="utf-8"
    )
    assert "unsupported_tools_route" in route_output
    assert "web_search" not in route_output


def test_missing_tools_json_writes_sanitized_failure_without_raw_path(
    tmp_path: Path,
) -> None:
    """tools JSON がなければパスを出さない失敗を書くこと"""
    app = _configured_app("5", 0)
    missing = tmp_path / "missing-tools.json"
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(missing))
    app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    app.set_view_name("missing-tools-json.txt")

    app.before_execute()
    app.write([])

    output = (tmp_path / "missing-tools-json.txt").read_text(encoding="utf-8")
    assert "invalid_tools_input" in output
    assert str(missing) not in output


def test_missing_text_data_json_writes_sanitized_failure_without_raw_path(
    tmp_path: Path,
) -> None:
    """textData JSON がなければパス・資格情報を出さない失敗を書くこと"""
    app = _configured_app("5")
    missing = tmp_path / "missing.json"
    app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(missing))
    app.set_property(PropertyIds.OUTPUT_DIR, str(tmp_path))
    app.set_view_name("answer.txt")

    app.before_execute()
    app.write([])

    output = (tmp_path / "answer.txt").read_text(encoding="utf-8")
    assert SecuAiGentTextDataFailure.code in output
    assert str(missing) not in output
    assert "property-login" not in output


def test_library_creation_without_nonblank_message_id_fails_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """createLibrary=true で messageId が空ならプロバイダを呼ばずに失敗を書くこと"""
    for index, text_data_json in enumerate(
        (
            '{"createLibrary":true}',
            '{"createLibrary":true,"messageId":null}',
            '{"createLibrary":true,"messageId":"   \\t"}',
        )
    ):
        text_data_path = write_text_data_fixture(tmp_path, text_data_json)
        app = _configured_app("5", 0)
        app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))

        output = _assert_no_provider_invocation_failure(
            app,
            tmp_path,
            f"invalid-library-pair-{index}.txt",
            SecuAiGentTextDataFailure.code,
            (
                str(text_data_path),
                text_data_json,
                "property-login",
                "property-provider.invalid",
                "property-tenant",
            ),
            expect_no_controller_construction=True,
        )

        assert f"{SecuAiGentTextDataFailure.code}:" in output
        assert "SECUAIGENT_VALIDATION_FAILURE" not in output


def test_invalid_authorization_tools_json_fails_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """Bearer 付きの authorization の tools JSON はプロバイダを呼ばずに失敗を書くこと"""
    tools_json_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token","authorization":"Bearer [REDACTED]"}]}
        """,
    )
    app = _configured_app("5", 0)
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))
    app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")

    _assert_no_provider_invocation_failure(
        app,
        tmp_path,
        "invalid-auth-tools-json.txt",
        "invalid_tools_input",
        (
            str(tools_json_path),
            "fixture-label-token",
            "fixture-url-token",
            "[REDACTED]",
            "web_search",
        ),
    )


def test_invalid_header_tools_json_fails_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """Authorization ヘッダーの tools JSON はプロバイダを呼ばずに失敗を書くこと"""
    tools_json_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token",
        "headers":{" Authorization ":"fixture-header-token"}}]}
        """,
    )
    app = _configured_app("5", 0)
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))
    app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")

    _assert_no_provider_invocation_failure(
        app,
        tmp_path,
        "invalid-header-tools-json.txt",
        "invalid_tools_input",
        (
            str(tools_json_path),
            "fixture-label-token",
            "fixture-url-token",
            "fixture-header-token",
            "web_search",
        ),
    )


def test_merge_conflict_fails_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """textData と tools JSON の重ね合わせの衝突はプロバイダを呼ばずに失敗を書くこと"""
    text_data_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token"}]}
        """,
    )
    tools_json_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"alternate-fixture-url-token"}]}
        """,
    )
    app = _configured_app("5", 0)
    app.set_property(PropertyIds.TEXT_DATA_JSON_FILE_PATH, str(text_data_path))
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))

    _assert_no_provider_invocation_failure(
        app,
        tmp_path,
        "merge-conflict-tools-json.txt",
        "invalid_tools_input",
        (
            str(text_data_path),
            str(tools_json_path),
            "fixture-label-token",
            "fixture-url-token",
            "alternate-fixture-url-token",
        ),
    )


def test_missing_malformed_and_duplicate_tools_json_fail_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """ない・壊れた・キーが重複した tools JSON はプロバイダを呼ばずに失敗を書くこと"""
    missing = tmp_path / "missing-tools-for-no-provider.json"
    missing_app = _configured_app("5", 0)
    missing_app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(missing))
    _assert_no_provider_invocation_failure(
        missing_app,
        tmp_path,
        "missing-tools-no-provider.txt",
        "invalid_tools_input",
        (str(missing),),
    )

    malformed = write_text_data_fixture(tmp_path, '{"tools":[{"name":"web_search"}')
    malformed_app = _configured_app("5", 0)
    malformed_app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(malformed))
    _assert_no_provider_invocation_failure(
        malformed_app,
        tmp_path,
        "malformed-tools-no-provider.txt",
        "invalid_tools_input",
        (str(malformed), "web_search"),
    )

    duplicate = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[],"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token"}]}
        """,
    )
    duplicate_app = _configured_app("5", 0)
    duplicate_app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(duplicate))
    duplicate_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")
    _assert_no_provider_invocation_failure(
        duplicate_app,
        tmp_path,
        "duplicate-tools-no-provider.txt",
        "invalid_tools_input",
        (str(duplicate), "fixture-label-token", "fixture-url-token", "web_search"),
    )

    duplicate_tool_object = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token","server_url":"alternate-fixture-url-token"}]}
        """,
    )
    duplicate_tool_object_app = _configured_app("5", 0)
    duplicate_tool_object_app.set_property(
        PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(duplicate_tool_object)
    )
    duplicate_tool_object_app.set_property(PropertyIds.CHAT_TOOLS_NAME, "web_search")
    _assert_no_provider_invocation_failure(
        duplicate_tool_object_app,
        tmp_path,
        "duplicate-tool-object-tools-no-provider.txt",
        "invalid_tools_input",
        (
            str(duplicate_tool_object),
            "fixture-label-token",
            "fixture-url-token",
            "alternate-fixture-url-token",
            "web_search",
        ),
    )


def test_unsupported_provider_tools_fail_before_provider_invocation(
    tmp_path: Path, write_text_data_fixture: WriteFixture
) -> None:
    """SecuAiGent 以外の tools はプロバイダを呼ばずに失敗を書くこと"""
    tools_json_path = write_text_data_fixture(
        tmp_path,
        """
        {"tools":[{"name":"mcp","server_label":"fixture-label-token",
        "server_url":"fixture-url-token","authorization":"fixture-auth-token"}]}
        """,
    )
    app = _configured_app("0", 0)
    app.set_property(PropertyIds.CHAT_TOOLS_JSON_FILE_PATH, str(tools_json_path))

    _assert_no_provider_invocation_failure(
        app,
        tmp_path,
        "unsupported-provider-no-provider.txt",
        "unsupported_tools_provider",
        (
            str(tools_json_path),
            "fixture-label-token",
            "fixture-url-token",
            "fixture-auth-token",
        ),
    )
