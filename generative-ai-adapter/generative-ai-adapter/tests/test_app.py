"""App の設定・検証・経路選択のテスト（移植元 AppTest）。

移植元との違い:

- Mockito の `@InjectMocks` で入れていた RequestSchemaFactory・GenerativeAiController の
  モックは、`App._request_schema_factory`・`App._controller` に MagicMock を入れて代える
- リフレクションで読んでいた private の項目は、Python 版の公開の属性で確かめる
- `validateColumnInformation` の文字コードの引数（CharacterSet）は Python 版にないため渡さない
- `getColumnInformation` は Python 版の ColumnInformation が持つ名前・型・index だけを比べる
- `initGenerativeAiController` のスパイは、`App._init_controller` の差し替えで代える
- 未知のベンダー ID は、移植元の "99" が Python 版では確認用の Echo に割り当てられて
  いるため、どちらでも未知の "98"・"999" で確かめる
"""

from unittest.mock import ANY, MagicMock

import pytest
from generative_ai_adapter.app import App
from generative_ai_adapter.constants import (
    ImageExplanationMode,
    PropertyIds,
    ReasoningEffort,
    Verbosity,
)
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.domain import ProxySetting
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.waha import ColumnInformation, ColumnType

VALID_OUTPUT_DIR_FIXTURE = "Z:\\fixture\\output"
OUTPUT_PATH = "outputDir/testViewName"


def _user_column() -> ColumnInformation:
    """ユーザー（index 0）の文字の列を作る。

    Returns
    -------
    ColumnInformation
        ユーザーの列。
    """
    return ColumnInformation("ユーザー", ColumnType.CHAR, 0)


def _app_with_mocks() -> tuple[App, MagicMock, MagicMock]:
    """RequestSchemaFactory・controller をモックにした App を作る。

    Returns
    -------
    tuple[App, MagicMock, MagicMock]
        App、RequestSchemaFactory のモック、controller のモック。
    """
    app = App()
    factory = MagicMock(spec=RequestSchemaFactory)
    controller = MagicMock(spec=GenerativeAiController)
    app._request_schema_factory = factory
    app._controller = controller
    return app, factory, controller


def _configure_write(app: App, output_type: int) -> None:
    """write の前の設定（モデル・出力先・ビュー名・列・出力モード）をする。

    Parameters
    ----------
    app : App
        設定する App。
    output_type : int
        出力モード。
    """
    app.set_property(PropertyIds.MODEL_NAME, "test-model")
    app.set_property(PropertyIds.OUTPUT_DIR, "outputDir")
    app.set_view_name("testViewName")
    app.set_column_information([_user_column()])
    app.connect(output_type)


def test_chat() -> None:
    """読み込みモードで connect しても例外にならないこと"""
    app = App()
    app.connect(0)
    assert app.output_type == 0


def test_validate_column_information_basic_pass() -> None:
    """index 0 の文字の列は検証を通ること"""
    app = App()
    column = ColumnInformation("テストカラム", ColumnType.CHAR, 0)
    assert app.validate_column_information(column) is True


def test_validate_column_information_index4_requires_file() -> None:
    """会話履歴 Json（index 4）は FILE でなければ例外になること"""
    app = App()
    invalid = ColumnInformation("会話履歴 Json", ColumnType.CHAR, 4)
    with pytest.raises(RuntimeError) as exc_info:
        app.validate_column_information(invalid)
    assert "型が[FILE]" in str(exc_info.value)

    valid = ColumnInformation("会話履歴 Json", ColumnType.FILE, 4)
    assert app.validate_column_information(valid) is True


def test_validate_column_information_index3_and_5_require_char() -> None:
    """ファイルパス（index 3）・コンテクスト（index 5）は文字でなければ例外になること"""
    app = App()
    invalid3 = ColumnInformation("ファイルパス", ColumnType.FILE, 3)
    with pytest.raises(RuntimeError) as exc_info3:
        app.validate_column_information(invalid3)
    assert "型が[文字]" in str(exc_info3.value)
    valid3 = ColumnInformation("ファイルパス", ColumnType.CHAR, 3)
    assert app.validate_column_information(valid3) is True

    invalid5 = ColumnInformation("コンテクスト", ColumnType.FILE, 5)
    with pytest.raises(RuntimeError) as exc_info5:
        app.validate_column_information(invalid5)
    assert "型が[文字]" in str(exc_info5.value)
    valid5 = ColumnInformation("コンテクスト", ColumnType.CHAR, 5)
    assert app.validate_column_information(valid5) is True


def test_validate_property_with_valid_value() -> None:
    """正しい値のプロパティは検証を通ること"""
    app = App()
    assert app.validate_property(0, "http://invalid.url") is True
    assert app.validate_property(1, "val-idaccesskey") is True
    assert app.validate_property(2, "0") is True
    assert app.validate_property(3, "http://invalid.url") is True
    assert app.validate_property(6, "1234") is True
    assert app.validate_property(8, "validuserid") is True
    assert app.validate_property(9, "validpassword") is True


def test_validate_property_with_empty_value() -> None:
    """URL・API キーが空なら例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(0, "")
    with pytest.raises(RuntimeError):
        app.validate_property(1, "")


def test_validate_property_with_invalid_value() -> None:
    """Proxy 認証のユーザ ID・パスワードが英数字でなければ例外になること"""
    app = App()
    with pytest.raises(RuntimeError) as user_error:
        app.validate_property(8, "user id with spaces")
    assert str(user_error.value) == (
        "Proxy認証ユーザIDに不正な値が入力されています。英数字で入力してください。"
        "user id with spaces"
    )
    with pytest.raises(RuntimeError) as pass_error:
        app.validate_property(9, "password with special charactersあああ")
    assert str(pass_error.value) == (
        "Proxy認証パスワードに不正な値が入力されています。英数字で入力してください。"
        "password with special charactersあああ"
    )


def test_validate_property_with_valid_output_directory() -> None:
    """Windows のディレクトリパスは出力先の検証を通ること"""
    app = App()
    assert app.validate_property(11, VALID_OUTPUT_DIR_FIXTURE) is True


def test_validate_property_with_invalid_output_directory() -> None:
    """ディレクトリパスでない出力先は例外になること"""
    app = App()
    with pytest.raises(RuntimeError) as exc_info:
        app.validate_property(11, "invalid_directory")
    assert (
        "出力先ディレクトリに不正な値が入力されています。"
        "有効なディレクトリパスを入力してください。invalid_directory"
    ) in str(exc_info.value)


def test_invalid_proxy_port_number_out_of_range() -> None:
    """Proxy ポート番号が 0〜65535 の外なら範囲のメッセージで例外になること"""
    app = App()
    with pytest.raises(RuntimeError) as too_large:
        app.validate_property(6, "70000")
    assert (
        "Proxyポート番号に不正な値が入力されています。0~65535の間で指定してください。70000"
    ) in str(too_large.value)
    with pytest.raises(RuntimeError) as negative:
        app.validate_property(6, "-1")
    assert (
        "Proxyポート番号に不正な値が入力されています。0~65535の間で指定してください。-1"
    ) in str(negative.value)


def test_invalid_proxy_port_number_not_integer() -> None:
    """Proxy ポート番号が整数でなければ整数のメッセージで例外になること"""
    app = App()
    with pytest.raises(RuntimeError) as exc_info:
        app.validate_property(6, "abc")
    assert str(exc_info.value) == (
        "Proxyポート番号に不正な値が入力されています。数値を整数で入力してください。abc"
    )


@pytest.mark.parametrize(
    ("prop_id", "value", "attribute", "expected"),
    [
        (4, "1", "use_proxy", 1),
        (5, "test", "proxy_host", "test"),
        (6, "80", "proxy_port", 80),
        (7, "1", "use_proxy_cred", True),
        (8, "test", "proxy_id", "test"),
        (9, "test", "proxy_pass", "test"),
        (10, "1", "insecure_ssl_enabled", True),
    ],
)
def test_set_property_proxy_setting(
    prop_id: int, value: str, attribute: str, expected: object
) -> None:
    """プロキシのプロパティ（4〜10）がプロキシ設定に入ること"""
    app = App()
    app.set_property(prop_id, value)
    assert getattr(app.proxy_setting, attribute) == expected


def test_connect_success_no_user_proxy() -> None:
    """プロキシなしなら接続テストが通ること"""
    app = App()
    app.proxy_setting = ProxySetting(use_proxy=0, proxy_host="")
    assert app.test_connect() is True


def test_connect_failed_no_proxy_host_name() -> None:
    """手動プロキシでホスト名がなければ接続テストが例外になること"""
    app = App()
    app.proxy_setting = ProxySetting(use_proxy=1, proxy_host="")
    with pytest.raises(RuntimeError) as exc_info:
        app.test_connect()
    assert "Proxy設定が手動の場合はProxyホスト名が必要です。" in str(exc_info.value)


def test_connect_failed_no_proxy_port_number() -> None:
    """手動プロキシでポート番号がなければ接続テストが例外になること"""
    app = App()
    app.proxy_setting = ProxySetting(use_proxy=1, proxy_host="hostname", proxy_port=-1)
    with pytest.raises(RuntimeError) as exc_info:
        app.test_connect()
    assert "Proxy設定が手動の場合はProxyポート番号が必要です。" in str(exc_info.value)


def test_validate_property_with_valid_url() -> None:
    """http・https の URL は検証を通ること"""
    app = App()
    assert app.validate_property(0, "http://valid.url") is True
    assert app.validate_property(0, "https://valid.url") is True


def test_validate_property_with_invalid_url() -> None:
    """スキームのない・http 以外の URL は例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(0, "invalid.url")
    with pytest.raises(RuntimeError):
        app.validate_property(0, "ftp://invalid.url")


def test_validate_property_with_valid_api_key() -> None:
    """空白を含まない API キーは検証を通ること"""
    app = App()
    assert app.validate_property(1, "valid-api-key") is True


def test_validate_property_with_valid_test_url() -> None:
    """プロパティ 3 は URL の形でも検証を通ること"""
    app = App()
    assert app.validate_property(3, "http://valid.test.url") is True
    assert app.validate_property(3, "https://valid.test.url") is True


def test_validate_property_with_valid_proxy_port_number() -> None:
    """範囲内の Proxy ポート番号は検証を通ること"""
    app = App()
    assert app.validate_property(6, "1234") is True


def test_validate_property_with_invalid_proxy_port_number_out_of_range() -> None:
    """範囲外の Proxy ポート番号は例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(6, "-1")
    with pytest.raises(RuntimeError):
        app.validate_property(6, "70000")


def test_validate_property_with_invalid_proxy_port_number_not_integer() -> None:
    """整数でない Proxy ポート番号は例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(6, "abc")


def test_validate_property_with_valid_proxy_auth_user_id_and_password() -> None:
    """英数字の Proxy 認証ユーザ ID・パスワードは検証を通ること"""
    app = App()
    assert app.validate_property(8, "validuserid") is True
    assert app.validate_property(9, "validpassword") is True


def test_validate_property_with_valid_numeric_values() -> None:
    """数値のプロパティ（17〜21）は数値なら検証を通ること"""
    app = App()
    assert app.validate_property(17, "123") is True
    assert app.validate_property(18, "3.14") is True
    assert app.validate_property(19, "-10") is True
    assert app.validate_property(20, "0") is True
    assert app.validate_property(21, "1000000") is True


@pytest.mark.parametrize(
    ("prop_id", "value"),
    [
        (17, "abc"),
        (18, "1.23.45"),
        (19, "ten"),
        (20, "zero"),
        (21, "1,000,000"),
    ],
)
def test_validate_property_with_invalid_numeric_values(
    prop_id: int, value: str
) -> None:
    """数値のプロパティ（17〜21）は数値でなければ例外になること"""
    app = App()
    with pytest.raises(RuntimeError):
        app.validate_property(prop_id, value)


@pytest.mark.parametrize(
    ("prop_id", "value"),
    [
        (0, "https://valid.url"),
        (1, "valid-api-key"),
        (2, "123"),
        (6, "8080"),
        (11, VALID_OUTPUT_DIR_FIXTURE),
        (17, "100"),
        (18, "0.7"),
        (19, "0.1"),
        (20, "0.2"),
        (21, "0.9"),
        (22, "stop_token"),
        (17, ""),
        (18, ""),
        (19, ""),
        (20, ""),
        (21, ""),
        (22, ""),
    ],
)
def test_set_property_accepts_valid_or_empty_value(prop_id: int, value: str) -> None:
    """正しい値・任意のプロパティの空の値は例外にならないこと"""
    app = App()
    app.set_property(prop_id, value)


def test_set_property_stores_generation_parameters() -> None:
    """生成パラメータ（17〜22）が値として入ること"""
    app = App()
    app.set_property(17, "100")
    app.set_property(18, "0.7")
    app.set_property(19, "0.1")
    app.set_property(20, "0.2")
    app.set_property(21, "0.9")
    app.set_property(22, "stop_token")
    parameter = app.chat_gpt_parameter
    assert parameter.max_tokens == 100
    assert parameter.temperature == 0.7
    assert parameter.frequency_penalty == 0.1
    assert parameter.presence_penalty == 0.2
    assert parameter.top_p == 0.9
    assert parameter.stop == "stop_token"


def test_set_property_with_valid_tenant_id_for_prop_id3() -> None:
    """テナント ID が入り、テスト用 URL は入らないこと"""
    app = App()
    app.set_property(3, "tenant-fixture")
    assert app.access_credential.tenant_id == "tenant-fixture"
    assert app.access_credential.test_url is None


def test_set_property_trims_tenant_id_for_prop_id3() -> None:
    """テナント ID の前後の空白が除かれること"""
    app = App()
    app.set_property(3, "  tenant-fixture  ")
    assert app.access_credential.tenant_id == "tenant-fixture"


def test_set_property_trims_whitespace_only_tenant_id_to_blank_for_prop_id3() -> None:
    """空白だけのテナント ID は空文字列になること"""
    app = App()
    app.set_property(3, "   ")
    assert app.access_credential.tenant_id == ""


def test_set_property_with_empty_proxy_port_for_prop_id6() -> None:
    """空の Proxy ポート番号は -1 になること"""
    app = App()
    app.set_property(6, "")
    assert app.proxy_setting.proxy_port == -1


def test_get_view_names_returns_specific_string() -> None:
    """ビュー名の一覧が固定の案内文であること"""
    app = App()
    assert app.get_view_names() == [
        "インポート後に出力するファイル名に置き換えてください。"
    ]


def test_get_column_information_returns_correct_info() -> None:
    """既定の列がユーザー・システム・アシスタントの文字の列であること"""
    app = App()
    actual = app.get_column_information("任意のビュー名")
    expected = [
        ("ユーザー", ColumnType.CHAR, 0),
        ("システム", ColumnType.CHAR, 1),
        ("アシスタント", ColumnType.CHAR, 2),
    ]
    assert [(c.name, c.col_type, c.index) for c in actual] == expected


@pytest.mark.parametrize(
    ("prop_id", "value"),
    [
        (0, "https://valid.url"),
        (1, "validAPIKey123"),
        (3, "https://valid.test.url"),
        (6, "8080"),
        (8, "validUserID"),
        (9, "validPassword"),
        (11, VALID_OUTPUT_DIR_FIXTURE),
    ],
)
def test_validate_property_with_valid_values(prop_id: int, value: str) -> None:
    """正しい値のプロパティは例外にならないこと"""
    app = App()
    assert app.validate_property(prop_id, value) is True


def test_validate_property_additional_branch_cases() -> None:
    """空の出力先・ポート、API キーの空白、タイムアウトの範囲を検証すること"""
    app = App()
    assert app.validate_property(PropertyIds.OUTPUT_DIR, "") is True
    assert app.validate_property(PropertyIds.PROXY_PORT, "") is True
    with pytest.raises(RuntimeError):
        app.validate_property(PropertyIds.API_KEY, "bad key!")
    with pytest.raises(RuntimeError):
        app.validate_property(PropertyIds.TIMEOUT_SECONDS, "59")
    with pytest.raises(RuntimeError):
        app.validate_property(PropertyIds.TIMEOUT_SECONDS, "86401")
    assert app.validate_property(PropertyIds.TIMEOUT_SECONDS, "60") is True
    assert app.validate_property(PropertyIds.TIMEOUT_SECONDS, "86400") is True


def test_set_property_with_valid_vendor_name_for_prop_id30() -> None:
    """ベンダー ID（0〜4）がベンダー名になること"""
    app = App()
    credential = app.access_credential
    app.set_property(30, "0")
    assert credential.vendor_name == "OpenAI"
    app.set_property(30, "1")
    assert credential.vendor_name == "AzureOpenAI"
    app.set_property(30, "2")
    assert credential.vendor_name == "Anthropic"
    app.set_property(30, "3")
    assert credential.vendor_name == "VertexAI"
    app.set_property(30, "4")
    assert credential.vendor_name == "GoogleAIStudio"


def test_set_property_with_invalid_vendor_name_for_prop_id30() -> None:
    """未知のベンダー ID は実行できるプロバイダの一覧付きで例外になること"""
    app = App()
    with pytest.raises(ValueError) as exc_info:
        app.set_property(30, "98")
    assert "supported providers: OpenAI, AzureOpenAI" in str(exc_info.value)


def test_write_with_output_type0() -> None:
    """出力モード 0 は通常 chat の経路で出力先に書くこと"""
    app, factory, controller = _app_with_mocks()
    _configure_write(app, 0)
    schema = MagicMock()
    factory.create_request_schema.return_value = schema

    app.write([])

    factory.create_request_schema.assert_called_once_with("test-model", [], ANY, ANY)
    factory.create_request_schema_with_context.assert_not_called()
    controller.execute_llm.assert_called_once_with(schema, OUTPUT_PATH)
    controller.execute_llm_with_context.assert_not_called()


def test_write_with_output_type2_uses_plain_answer_route() -> None:
    """出力モード 2 も通常 chat の経路で出力先に書くこと"""
    app, factory, controller = _app_with_mocks()
    _configure_write(app, 2)
    schema = MagicMock()
    factory.create_request_schema.return_value = schema

    app.write([])

    factory.create_request_schema.assert_called_once_with("test-model", [], ANY, ANY)
    factory.create_request_schema_with_context.assert_not_called()
    controller.execute_llm.assert_called_once_with(schema, OUTPUT_PATH)
    controller.execute_llm_with_context.assert_not_called()


def test_write_with_output_type_not0() -> None:
    """出力モード 1 は RAG の経路で出力先に書くこと"""
    app, factory, controller = _app_with_mocks()
    _configure_write(app, 1)
    schema = MagicMock()
    factory.create_request_schema_with_context.return_value = schema

    app.write([])

    factory.create_request_schema_with_context.assert_called_once_with(
        "test-model", [], ANY, ANY
    )
    factory.create_request_schema.assert_not_called()
    controller.execute_llm_with_context.assert_called_once_with(schema, OUTPUT_PATH)
    controller.execute_llm.assert_not_called()


def test_set_property_valid_vendor_id() -> None:
    """ベンダー ID "0" で OpenAI になること"""
    app = App()
    app.set_property(PropertyIds.VENDOR, "0")
    assert app.access_credential.vendor_name == "OpenAI"


def test_set_property_invalid_vendor_id() -> None:
    """未知のベンダー ID "999" は ValueError になること"""
    app = App()
    with pytest.raises(ValueError):
        app.set_property(PropertyIds.VENDOR, "999")


def test_set_property_empty_optional_property() -> None:
    """任意のプロパティの空の値は例外にならないこと"""
    app = App()
    app.set_property(PropertyIds.MAX_TOKENS, "")
    assert app.chat_gpt_parameter.max_tokens is None


def test_set_property_invalid_number_format() -> None:
    """数値でない最大トークン数は ValueError になること"""
    app = App()
    with pytest.raises(ValueError):
        app.set_property(PropertyIds.MAX_TOKENS, "invalid")


@pytest.mark.parametrize("value", ["0", "1", "2", "", "-1", "3", "abc"])
def test_validate_property_skips_image_explanation_mode_enum_values(value: str) -> None:
    """画像説明モード（ENUM）は値を検証しないこと"""
    app = App()
    assert app.validate_property(PropertyIds.IMAGE_EXPLANATION_MODE, value) is True


def test_set_property_with_valid_image_explanation_mode() -> None:
    """画像説明モード "1" で EMBED_ONLY になること"""
    app = App()
    app.set_property(PropertyIds.IMAGE_EXPLANATION_MODE, "1")
    assert app.image_explanation_mode == ImageExplanationMode.EMBED_ONLY


def test_set_property_maps_all_existing_image_explanation_modes() -> None:
    """画像説明モード 0・1・2 がそれぞれのモードになること"""
    app = App()
    modes: list[ImageExplanationMode] = []
    for value in ("0", "1", "2"):
        app.set_property(PropertyIds.IMAGE_EXPLANATION_MODE, value)
        modes.append(app.image_explanation_mode)
    assert modes == [
        ImageExplanationMode.DISABLED,
        ImageExplanationMode.EMBED_ONLY,
        ImageExplanationMode.FULL_PAGE,
    ]


def test_set_property_with_empty_image_explanation_mode() -> None:
    """空の画像説明モードは既定の DISABLED のままであること"""
    app = App()
    app.set_property(PropertyIds.IMAGE_EXPLANATION_MODE, "")
    assert app.image_explanation_mode == ImageExplanationMode.DISABLED


def test_set_property_reasoning_effort_and_verbosity() -> None:
    """推論の深さ "4"・詳細度 "3" がどちらも HIGH になること"""
    app = App()
    app.set_property(PropertyIds.REASONING_EFFORT, "4")
    app.set_property(PropertyIds.VERBOSITY, "3")
    assert app.chat_gpt_parameter.reasoning_effort == ReasoningEffort.HIGH
    assert app.chat_gpt_parameter.verbosity == Verbosity.HIGH


def test_before_execute_refreshes_existing_controller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """before_execute で controller を作り直し、RequestSchemaFactory を作ること"""
    app = App()
    existing = MagicMock(spec=GenerativeAiController)
    refreshed = MagicMock(spec=GenerativeAiController)
    init_controller = MagicMock(return_value=refreshed)
    app._controller = existing
    monkeypatch.setattr(app, "_init_controller", init_controller)

    app.before_execute()

    assert app._controller is refreshed
    assert app._request_schema_factory is not None
    init_controller.assert_called_once_with()


def test_init_controller_uses_vendor_and_output_type_for_core_runtime_boundary() -> (
    None
):
    """controller がベンダー・出力モードから core の chat・mapper を持つこと"""
    app = App()
    app.set_property(PropertyIds.URL, "https://provider.example.invalid")
    app.set_property(PropertyIds.API_KEY, "credential-marker")
    app.set_property(PropertyIds.MODEL_NAME, "model-name")
    app.set_property(PropertyIds.VENDOR, "0")
    app.connect(2)

    controller = app._init_controller()

    assert app.access_credential.vendor_name == "OpenAI"
    assert controller._runtime is not None
    assert controller._mapper is not None
    assert controller._output_type == 2
