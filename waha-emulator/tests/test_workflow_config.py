import json
from pathlib import Path
from typing import Any

import pytest
from generative_ai_adapter.constants import PropertyIds

from tests.conftest import make_settings
from waha_emulator.workflow_config import (
    ECHO_PROPERTIES,
    NORMAL_CHAT_OUTPUT_TYPE,
    PLAIN_ANSWER_OUTPUT_TYPE,
    RAG_OUTPUT_TYPE,
    WorkflowConfigError,
    WorkflowDefinition,
    default_definition,
    load_workflow_config,
    parse_workflow_config,
)

AZURE_PROPERTIES = {
    "VENDOR": "AzureOpenAI",
    "URL": "https://example.openai.azure.com",
    "API_KEY": "azure-key",
    "MODEL_NAME": "gpt-4o",
}


def _config(properties: dict[str, Any]) -> dict[str, Any]:
    """プロパティだけを書いた既定の定義の設定を作る。

    Parameters
    ----------
    properties : dict[str, Any]
        プロパティ（名前 → 値）。

    Returns
    -------
    dict[str, Any]
        ワークフローの設定（JSON の値）。
    """
    return {"default": {"properties": properties}}


def _default_properties(
    properties: dict[str, Any], environ: dict[str, str] | None = None
) -> dict[int, str]:
    """既定の定義として読み、ID → 値のプロパティを返す。

    Parameters
    ----------
    properties : dict[str, Any]
        プロパティ（名前 → 値）。
    environ : dict[str, str] | None
        環境変数。None なら空。

    Returns
    -------
    dict[int, str]
        読んだプロパティ。
    """
    config = parse_workflow_config(_config(properties), environ or {})
    return dict(config.default.properties)


def test_property_names_are_converted_to_ids() -> None:
    """プロパティの名前が移植元の PropertyIds の ID になること"""
    properties = _default_properties(
        {**AZURE_PROPERTIES, "MAX_TOKENS": 4000, "TEMPERATURE": "0.2"}
    )

    assert properties == {
        PropertyIds.VENDOR: "1",
        PropertyIds.URL: "https://example.openai.azure.com",
        PropertyIds.API_KEY: "azure-key",
        PropertyIds.MODEL_NAME: "gpt-4o",
        PropertyIds.MAX_TOKENS: "4000",
        PropertyIds.TEMPERATURE: "0.2",
    }


@pytest.mark.parametrize(
    ("value", "expected"),
    [("AzureOpenAI", "1"), ("azureopenai", "1"), ("1", "1"), ("Echo", "99")],
)
def test_vendor_name_is_converted_to_id(value: str, expected: str) -> None:
    """VENDOR は名前（大文字小文字を問わない）でも ID でも書けること"""
    properties = _default_properties({"VENDOR": value})

    assert properties[PropertyIds.VENDOR] == expected


def test_unknown_vendor_is_rejected() -> None:
    """未知の VENDOR はエラーにすること"""
    with pytest.raises(WorkflowConfigError, match="VENDOR が不正です: Unknown"):
        _default_properties({"VENDOR": "Unknown"})


def test_env_reference_is_expanded() -> None:
    """値の `${環境変数}` が読み込み時に展開されること"""
    properties = _default_properties(
        {"API_KEY": "${AZURE_KEY}", "MODEL_NAME": "model-${SUFFIX}"},
        {"AZURE_KEY": "secret-key", "SUFFIX": "mini"},
    )

    assert properties[PropertyIds.API_KEY] == "secret-key"
    assert properties[PropertyIds.MODEL_NAME] == "model-mini"


def test_missing_env_reference_is_rejected() -> None:
    """展開する環境変数がなければ、その名前を示してエラーにすること"""
    with pytest.raises(WorkflowConfigError, match="環境変数 MISSING_KEY"):
        _default_properties({"API_KEY": "${MISSING_KEY}"})


@pytest.mark.parametrize(
    "name", ["OUTPUT_DIR", "REASONING_OUTPUT_PATH", "TEXT_DATA_JSON_FILE_PATH"]
)
def test_reserved_properties_are_rejected(name: str) -> None:
    """エミュレーターがジョブごとに決めるプロパティは書けないこと"""
    with pytest.raises(WorkflowConfigError, match=f"default: {name} はエミュレーター"):
        _default_properties({name: "C:\\out"})


def test_unknown_property_is_rejected() -> None:
    """未知のプロパティ名はエラーにすること"""
    with pytest.raises(WorkflowConfigError, match="未知のプロパティです: NOT_A_PROP"):
        _default_properties({"NOT_A_PROP": "x"})


@pytest.mark.parametrize("value", [True, None, ["x"], {"a": 1}])
def test_non_scalar_property_value_is_rejected(value: Any) -> None:
    """プロパティの値が文字列・数値でなければエラーにすること"""
    with pytest.raises(WorkflowConfigError, match="MODEL_NAME の値は文字列"):
        _default_properties({"MODEL_NAME": value})


@pytest.mark.parametrize(
    ("properties", "message"),
    [
        ({"URL": "ftp://example.com"}, "default: URL: 生成AI URLに不正な値"),
        ({"API_KEY": "has space"}, "default: API_KEY: 生成AI API Keyに不正な値"),
        ({"TIMEOUT_SECONDS": "10"}, "default: TIMEOUT_SECONDS: タイムアウトの値"),
        ({"TIMEOUT_SECONDS": "abc"}, "default: TIMEOUT_SECONDS: "),
        ({"PROXY_PORT": "70000"}, "default: PROXY_PORT: Proxyポート番号"),
    ],
)
def test_adapter_property_validation_errors_surface(
    properties: dict[str, Any], message: str
) -> None:
    """アダプタの保存時チェックで不正な値は、場所と名前付きのエラーにすること"""
    with pytest.raises(WorkflowConfigError, match=message):
        _default_properties(properties)


@pytest.mark.parametrize(
    "output_type",
    [NORMAL_CHAT_OUTPUT_TYPE, RAG_OUTPUT_TYPE, PLAIN_ANSWER_OUTPUT_TYPE],
)
def test_valid_output_types_are_accepted(output_type: int) -> None:
    """outputType は 0・1・2 を受け付けること"""
    config = parse_workflow_config({"default": {"outputType": output_type}}, {})

    assert config.default.output_type == output_type


@pytest.mark.parametrize("output_type", [3, -1, "1", True, 1.5])
def test_invalid_output_type_is_rejected(output_type: Any) -> None:
    """outputType が 0・1・2 の整数でなければエラーにすること"""
    with pytest.raises(WorkflowConfigError, match="outputType は 0・1・2"):
        parse_workflow_config({"default": {"outputType": output_type}}, {})


def test_output_type_defaults_to_normal_chat() -> None:
    """outputType を省略すると通常 chat（0）になること"""
    config = parse_workflow_config({"default": {}}, {})

    assert config.default == WorkflowDefinition()


def test_services_are_parsed_per_service_id() -> None:
    """services のサービス ID ごとに定義が読まれること"""
    config = parse_workflow_config(
        {
            "default": {"properties": ECHO_PROPERTIES},
            "services": {
                "rag": {
                    "outputType": RAG_OUTPUT_TYPE,
                    "properties": {"RAG_CONTEXT_JSON_ALLOW_ROOT": "/rag"},
                    "ragContextJson": "context.json",
                }
            },
        },
        {},
    )

    rag = config.services["rag"]
    assert rag.output_type == RAG_OUTPUT_TYPE
    assert rag.properties == {PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT: "/rag"}
    assert rag.rag_context_json == "context.json"
    assert config.default.properties[PropertyIds.VENDOR] == "99"


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ([], "オブジェクトにしてください"),
        ({"default": {}, "extra": 1}, r"未知の項目です: \['extra'\]"),
        ({"services": {}}, "default の定義が必要です"),
        ({"default": {}, "services": []}, "services はオブジェクト"),
        ({"default": "x"}, "default: 定義はオブジェクト"),
        ({"default": {"unknown": 1}}, r"default: 未知の項目です: \['unknown'\]"),
        ({"default": {"properties": []}}, "default: properties はオブジェクト"),
        ({"default": {"ragContextJson": 1}}, "ragContextJson は文字列"),
        (
            {"default": {}, "services": {"svc": {"outputType": 9}}},
            "services.svc: outputType",
        ),
    ],
)
def test_invalid_structure_is_rejected(data: Any, message: str) -> None:
    """構造が不正な設定は、場所の分かるメッセージでエラーにすること"""
    with pytest.raises(WorkflowConfigError, match=message):
        parse_workflow_config(data, {})


def test_describe_does_not_include_secret() -> None:
    """ログ用の要約に API キーが出ないこと"""
    config = parse_workflow_config(_config(AZURE_PROPERTIES), {})

    summary = config.default.describe()

    assert "vendor=AzureOpenAI" in summary
    assert "model=gpt-4o" in summary
    assert "azure-key" not in summary


def test_default_definition_for_echo() -> None:
    """LLM_PROVIDER=echo の既定の定義は Echo ベンダーの通常 chat になること"""
    definition = default_definition(make_settings())

    assert definition.output_type == NORMAL_CHAT_OUTPUT_TYPE
    assert definition.properties == {
        PropertyIds.VENDOR: "99",
        PropertyIds.URL: ECHO_PROPERTIES["URL"],
        PropertyIds.API_KEY: ECHO_PROPERTIES["API_KEY"],
        PropertyIds.MODEL_NAME: ECHO_PROPERTIES["MODEL_NAME"],
    }


def test_default_definition_for_azure_openai() -> None:
    """LLM_PROVIDER=azure_openai の既定の定義は AZURE_OPENAI_* の値を使うこと"""
    settings = make_settings(
        LLM_PROVIDER="azure_openai",
        AZURE_OPENAI_ENDPOINT="https://example.openai.azure.com",
        AZURE_OPENAI_API_KEY="azure-key",
        AZURE_OPENAI_DEPLOYMENT="gpt-4o",
    )

    definition = default_definition(settings)

    assert definition.properties == {
        PropertyIds.VENDOR: "1",
        PropertyIds.URL: "https://example.openai.azure.com",
        PropertyIds.API_KEY: "azure-key",
        PropertyIds.MODEL_NAME: "gpt-4o",
    }


def test_load_without_file_uses_default_definition() -> None:
    """WAHA_WORKFLOWS_FILE がなければ LLM_PROVIDER の既定の定義だけになること"""
    settings = make_settings()

    config = load_workflow_config(settings)

    assert config.default == default_definition(settings)
    assert config.services == {}


def test_load_from_file_expands_os_environ(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """WAHA_WORKFLOWS_FILE の JSON を読み、`${環境変数}` を os.environ から展開すること"""
    monkeypatch.setenv("WORKFLOW_TEST_KEY", "from-env")
    path = tmp_path / "workflows.json"
    path.write_text(
        json.dumps(
            {
                "default": {"properties": ECHO_PROPERTIES},
                "services": {
                    "plain": {
                        "outputType": PLAIN_ANSWER_OUTPUT_TYPE,
                        "properties": {"API_KEY": "${WORKFLOW_TEST_KEY}"},
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    config = load_workflow_config(make_settings(WAHA_WORKFLOWS_FILE=str(path)))

    plain = config.services["plain"]
    assert plain.output_type == PLAIN_ANSWER_OUTPUT_TYPE
    assert plain.properties == {PropertyIds.API_KEY: "from-env"}


def test_load_missing_file_is_rejected(tmp_path: Path) -> None:
    """WAHA_WORKFLOWS_FILE のファイルがなければエラーにすること"""
    settings = make_settings(WAHA_WORKFLOWS_FILE=str(tmp_path / "missing.json"))

    with pytest.raises(WorkflowConfigError, match="WAHA_WORKFLOWS_FILE を読めません"):
        load_workflow_config(settings)


def test_load_invalid_json_is_rejected(tmp_path: Path) -> None:
    """WAHA_WORKFLOWS_FILE が JSON として読めなければエラーにすること"""
    path = tmp_path / "workflows.json"
    path.write_text("{not json", encoding="utf-8")

    with pytest.raises(WorkflowConfigError, match="WAHA_WORKFLOWS_FILE を読めません"):
        load_workflow_config(make_settings(WAHA_WORKFLOWS_FILE=str(path)))
