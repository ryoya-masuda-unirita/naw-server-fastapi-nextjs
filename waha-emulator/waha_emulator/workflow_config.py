"""サービス ID → ワークフロー（生成AIアダプタの出力モード・プロパティ）の対応。

本物の Waha! では、サービス（ジョブ）ごとにどのアダプタをどのプロパティで動かすかを
管理コンソールで登録する。エミュレーターでは JSON ファイル（`WAHA_WORKFLOWS_FILE`）に
書く。形式は README の「ワークフローの設定」を参照。

- `services` に書いたサービス ID はその定義、それ以外は `default` の定義で動かす
- プロパティは移植元の PropertyIds の名前で書く（`VENDOR` は "1" でも "AzureOpenAI" でもよい）
- 値の `${環境変数}` は読み込み時に展開する（API キーをファイルに書かないため）
- `OUTPUT_DIR`・`REASONING_OUTPUT_PATH`・`TEXT_DATA_JSON_FILE_PATH` はエミュレーターが
  ジョブごとに決めるため書けない
- ファイルがなければ `LLM_PROVIDER`（echo / azure_openai）から既定の定義を作る
"""

import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from generative_ai_adapter.app import App
from generative_ai_adapter.constants import PropertyIds
from generative_ai_adapter.vendor import VENDOR_MAP

from waha_emulator.config import LlmProvider, Settings

NORMAL_CHAT_OUTPUT_TYPE = 0
RAG_OUTPUT_TYPE = 1
PLAIN_ANSWER_OUTPUT_TYPE = 2
OUTPUT_TYPES = frozenset(
    {NORMAL_CHAT_OUTPUT_TYPE, RAG_OUTPUT_TYPE, PLAIN_ANSWER_OUTPUT_TYPE}
)
RESERVED_PROPERTIES = frozenset(
    {"OUTPUT_DIR", "REASONING_OUTPUT_PATH", "TEXT_DATA_JSON_FILE_PATH"}
)
DEFINITION_KEYS = frozenset({"outputType", "properties", "ragContextJson"})
ROOT_KEYS = frozenset({"default", "services"})
_ENV_REFERENCE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
_VENDOR_ID_BY_NAME = {name.lower(): vendor_id for vendor_id, name in VENDOR_MAP.items()}

# echo はキーなしで動くが、core のプロバイダ設定は URL・キー・モデル名を必須に
# するため、使われない値を入れておく
ECHO_PROPERTIES = {
    "VENDOR": "Echo",
    "URL": "http://echo.invalid",
    "API_KEY": "echo",
    "MODEL_NAME": "echo",
}


class WorkflowConfigError(ValueError):
    """ワークフローの設定が不正（起動時に失敗させる）。"""


@dataclass(frozen=True)
class WorkflowDefinition:
    """1 つのサービスで動かす生成AIアダプタの設定。

    Attributes
    ----------
    output_type : int
        アダプタの出力モード（0=チャット用_回答、1=チャット用_コンテクスト（RAG）、
        2=回答の本文だけ）。
    properties : Mapping[int, str]
        アダプタのプロパティ（ID → 値）。
    rag_context_json : str | None
        RAG で index 6 に渡す RAG Context JSON のパス（`RAG_CONTEXT_JSON_ALLOW_ROOT`
        からの相対、または絶対パス）。検索アダプタを移植するまでの仮の入力。
    """

    output_type: int = NORMAL_CHAT_OUTPUT_TYPE
    properties: Mapping[int, str] = field(default_factory=dict)
    rag_context_json: str | None = None

    def describe(self) -> str:
        """ログに出す要約（API キーなどの値は出さない）。

        Returns
        -------
        str
            出力モード・ベンダー・モデル名。
        """
        vendor = self.properties.get(PropertyIds.VENDOR, "")
        model = self.properties.get(PropertyIds.MODEL_NAME, "")
        return (
            f"outputType={self.output_type}, vendor={VENDOR_MAP.get(vendor, vendor)}, "
            f"model={model}, ragContextJson={self.rag_context_json is not None}"
        )


@dataclass(frozen=True)
class WorkflowConfig:
    """既定の定義と、サービス ID ごとの定義。

    Attributes
    ----------
    default : WorkflowDefinition
        登録のないサービス ID で使う定義。
    services : Mapping[str, WorkflowDefinition]
        サービス ID ごとの定義。
    """

    default: WorkflowDefinition
    services: Mapping[str, WorkflowDefinition] = field(default_factory=dict)


def _expand_env(value: str, environ: Mapping[str, str]) -> str:
    """`${名前}` を環境変数の値に置き換える。

    Parameters
    ----------
    value : str
        値。
    environ : Mapping[str, str]
        環境変数。

    Returns
    -------
    str
        置き換えた値。

    Raises
    ------
    WorkflowConfigError
        環境変数がないとき。
    """

    def replace(match: re.Match[str]) -> str:
        """1 つの参照を置き換える。

        Parameters
        ----------
        match : re.Match[str]
            `${名前}` の一致。

        Returns
        -------
        str
            環境変数の値。

        Raises
        ------
        WorkflowConfigError
            環境変数がないとき。
        """
        name = match.group(1)
        if name not in environ:
            raise WorkflowConfigError(f"環境変数 {name} が設定されていません")
        return environ[name]

    return _ENV_REFERENCE.sub(replace, value)


def _vendor_id(value: str) -> str:
    """ベンダーの名前を ID にする（ID ならそのまま）。

    Parameters
    ----------
    value : str
        ID（"0"〜"5"・"99"）または名前（"AzureOpenAI" など）。

    Returns
    -------
    str
        ID。

    Raises
    ------
    WorkflowConfigError
        未知のベンダーのとき。
    """
    if value in VENDOR_MAP:
        return value
    vendor_id = _VENDOR_ID_BY_NAME.get(value.lower())
    if vendor_id is None:
        raise WorkflowConfigError(f"VENDOR が不正です: {value}")
    return vendor_id


def _properties(raw: Any, environ: Mapping[str, str], where: str) -> dict[int, str]:
    """プロパティの名前 → 値を ID → 値にし、アダプタの保存時チェックを通す。

    Parameters
    ----------
    raw : Any
        JSON の `properties`。
    environ : Mapping[str, str]
        環境変数。
    where : str
        エラーメッセージに出す場所（`default` やサービス ID）。

    Returns
    -------
    dict[int, str]
        ID → 値。

    Raises
    ------
    WorkflowConfigError
        名前・値が不正なとき。
    """
    if not isinstance(raw, dict):
        raise WorkflowConfigError(f"{where}: properties はオブジェクトにしてください")
    ids = PropertyIds.by_name()
    result: dict[int, str] = {}
    app = App()
    for name, value in raw.items():
        if name in RESERVED_PROPERTIES:
            raise WorkflowConfigError(
                f"{where}: {name} はエミュレーターが決めるため設定できません"
            )
        if name not in ids:
            raise WorkflowConfigError(f"{where}: 未知のプロパティです: {name}")
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            raise WorkflowConfigError(f"{where}: {name} の値は文字列にしてください")
        text = _expand_env(str(value), environ)
        if name == "VENDOR":
            text = _vendor_id(text)
        try:
            app.validate_property(ids[name], text)
        except (RuntimeError, ValueError) as e:
            raise WorkflowConfigError(f"{where}: {name}: {e}") from e
        result[ids[name]] = text
    return result


def _definition(raw: Any, environ: Mapping[str, str], where: str) -> WorkflowDefinition:
    """1 つの定義を読む。

    Parameters
    ----------
    raw : Any
        JSON の定義。
    environ : Mapping[str, str]
        環境変数。
    where : str
        エラーメッセージに出す場所。

    Returns
    -------
    WorkflowDefinition
        定義。

    Raises
    ------
    WorkflowConfigError
        定義が不正なとき。
    """
    if not isinstance(raw, dict):
        raise WorkflowConfigError(f"{where}: 定義はオブジェクトにしてください")
    unknown = set(raw) - DEFINITION_KEYS
    if unknown:
        raise WorkflowConfigError(f"{where}: 未知の項目です: {sorted(unknown)}")
    output_type = raw.get("outputType", NORMAL_CHAT_OUTPUT_TYPE)
    if output_type not in OUTPUT_TYPES or isinstance(output_type, bool):
        raise WorkflowConfigError(f"{where}: outputType は 0・1・2 のどれかです")
    rag_context_json = raw.get("ragContextJson")
    if rag_context_json is not None and not isinstance(rag_context_json, str):
        raise WorkflowConfigError(f"{where}: ragContextJson は文字列にしてください")
    return WorkflowDefinition(
        output_type,
        _properties(raw.get("properties", {}), environ, where),
        rag_context_json,
    )


def parse_workflow_config(
    data: Any, environ: Mapping[str, str] | None = None
) -> WorkflowConfig:
    """JSON（読み込み済み）からワークフローの設定を作る。

    Parameters
    ----------
    data : Any
        JSON の値。
    environ : Mapping[str, str] | None
        環境変数。None なら os.environ。

    Returns
    -------
    WorkflowConfig
        設定。

    Raises
    ------
    WorkflowConfigError
        設定が不正なとき。
    """
    env = os.environ if environ is None else environ
    if not isinstance(data, dict):
        raise WorkflowConfigError("ワークフローの設定はオブジェクトにしてください")
    unknown = set(data) - ROOT_KEYS
    if unknown:
        raise WorkflowConfigError(f"未知の項目です: {sorted(unknown)}")
    if "default" not in data:
        raise WorkflowConfigError("default の定義が必要です")
    services = data.get("services", {})
    if not isinstance(services, dict):
        raise WorkflowConfigError("services はオブジェクトにしてください")
    return WorkflowConfig(
        _definition(data["default"], env, "default"),
        {
            service_id: _definition(raw, env, f"services.{service_id}")
            for service_id, raw in services.items()
        },
    )


def default_definition(settings: Settings) -> WorkflowDefinition:
    """設定ファイルがないときの既定の定義（`LLM_PROVIDER` から作る）。

    Parameters
    ----------
    settings : Settings
        エミュレーターの設定。

    Returns
    -------
    WorkflowDefinition
        通常 chat（出力モード 0）の定義。
    """
    if settings.llm_provider == LlmProvider.AZURE_OPENAI:
        names = {
            "VENDOR": "AzureOpenAI",
            "URL": settings.azure_openai_endpoint,
            "API_KEY": settings.azure_openai_api_key,
            "MODEL_NAME": settings.azure_openai_deployment,
        }
    else:
        names = dict(ECHO_PROPERTIES)
    return _definition({"properties": names}, {}, "LLM_PROVIDER")


def load_workflow_config(settings: Settings) -> WorkflowConfig:
    """ワークフローの設定を読む。ファイルがなければ `LLM_PROVIDER` の既定だけにする。

    Parameters
    ----------
    settings : Settings
        エミュレーターの設定。

    Returns
    -------
    WorkflowConfig
        設定。

    Raises
    ------
    WorkflowConfigError
        ファイルが読めない・設定が不正なとき。
    """
    path: Path | None = settings.workflows_file
    if path is None:
        return WorkflowConfig(default_definition(settings))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise WorkflowConfigError(f"WAHA_WORKFLOWS_FILE を読めません: {e}") from e
    return parse_workflow_config(data)
