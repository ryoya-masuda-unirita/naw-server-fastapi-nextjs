"""生成AIアダプタの入口（移植元 App。Waha! の Adapter 実装）。

Waha! は `set_property` → `connect` → `set_column_information` → `set_view_name` →
`before_execute` → `write`（レコードごと）の順に呼ぶ。Python 版ではこの順序と各メソッドの
挙動を保ち、Waha! 固有の受け口だけを置き換える。

- プロパティ: ID と文字列の値（`constants.PropertyIds`）。呼び出し側（エミュレーター）が
  設定ファイルの名前付きの値を ID に変えて渡す
- レコード: バイト列ではなく `ColumnData` の列（`waha.py`）
- 出力: `OUTPUT_DIR/<ビュー名>` に書く（移植元と同じ）
"""

import logging
import re
from collections.abc import Sequence
from pathlib import Path

from generative_ai_core import failure as failures
from generative_ai_core.chat.models import CoreChatTool
from generative_ai_core.failure import CoreFailure

from generative_ai_adapter import property_validation, rag_context_json, vendor
from generative_ai_adapter.constants import (
    ImageExplanationMode,
    PropertyIds,
    ReasoningEffort,
    Verbosity,
)
from generative_ai_adapter.controller import GenerativeAiController
from generative_ai_adapter.core_mappers import ChatRuntimeFactory
from generative_ai_adapter.domain import (
    AccessCredential,
    ChatGPTParameter,
    ProxySetting,
    RequestSchema,
    RetrievalAnswer,
)
from generative_ai_adapter.request_schema_factory import RequestSchemaFactory
from generative_ai_adapter.textdata import (
    SecuAiGentTextDataFailure,
    apply_credential,
    apply_parameter,
    load_text_data_document,
    load_tools_json,
    merge_chat_tools,
)
from generative_ai_adapter.waha import ColumnData, ColumnInformation, ColumnType

logger = logging.getLogger(__name__)

SECUAIGENT = "SecuAiGent"
NORMAL_CHAT_OUTPUT_TYPES = (0, 2)
PLAIN_ANSWER_OUTPUT_TYPE = 2
INDEX_HISTORY = 4
INDEX_RAG_JSON = 6
INDEX_CONTEXT_PATH = 3
INDEX_CONTEXT = 5
MIN_TIMEOUT_SECONDS = 60
MAX_TIMEOUT_SECONDS = 86400
MIN_PORT = 0
MAX_PORT = 65535
NO_PORT = -1
TRUE_VALUE = "1"
LIBRARY_GENERATION_DEFAULT = "0"
LIBRARY_GENERATION_OFF = "1"
TOOLS_NAME_NONE = "0"
TOOLS_NAME_WEB_SEARCH = "1"
TOOLS_NAME_MCP = "2"
APPROVAL_NONE = "0"
APPROVAL_NEVER = "1"
APPROVAL_ALWAYS = "2"
WEB_SEARCH = "web_search"
MCP = "mcp"
NEVER = "never"
VIEW_NAME_PLACEHOLDER = "インポート後に出力するファイル名に置き換えてください。"
_URL_PATTERN = re.compile(r"^(http|https)://.*$", re.DOTALL)
_WINDOWS_PATH_PATTERN = re.compile(r"^[a-zA-Z]:\\.*$", re.DOTALL)
_ALNUM_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")
_OPTIONAL_PROPERTIES = frozenset(
    {
        PropertyIds.MAX_TOKENS,
        PropertyIds.TEMPERATURE,
        PropertyIds.FREQUENCY_PENALTY,
        PropertyIds.PRESENCE_PENALTY,
        PropertyIds.TOP_P,
        PropertyIds.STOP,
        PropertyIds.IMAGE_EXPLANATION_MODE,
        PropertyIds.REASONING_OUTPUT_PATH,
        PropertyIds.TEXT_DATA_JSON_FILE_PATH,
        PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT,
        PropertyIds.CHAT_TOOLS_NAME,
        PropertyIds.CHAT_MCP_SERVER_LABEL,
        PropertyIds.CHAT_MCP_SERVER_URL,
        PropertyIds.CHAT_MCP_REQUIRE_APPROVAL,
        PropertyIds.CHAT_TOOLS_JSON_FILE_PATH,
    }
)
INVALID_TOOLS_SUMMARY = (
    "invalid_tools_input: tools setting could not be used. Check allowed tool fields."
)
UNSUPPORTED_TOOLS_ROUTE_SUMMARY = (
    "unsupported_tools_route: tools are available only on normal chat routes."
)
UNSUPPORTED_TOOLS_PROVIDER_SUMMARY = (
    "unsupported_tools_provider: tools are available only for SecuAiGent."
)


def _is_number(value: str) -> bool:
    """Java の Double.parseDouble で読める数値かを返す。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    bool
        読めれば True。
    """
    try:
        float(value)
    except ValueError:
        return False
    return True


def _java_int(value: str) -> int:
    """Java の Integer.parseInt と同じく、符号付きの 10 進整数だけを読む。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    int
        整数。

    Raises
    ------
    ValueError
        整数でないとき。
    """
    if not re.fullmatch(r"[+-]?\d+", value):
        raise ValueError(f'For input string: "{value}"')
    return int(value)


def _normalize_optional(value: str | None) -> str | None:
    """空白だけなら None、それ以外は前後の空白を除く。

    Parameters
    ----------
    value : str | None
        値。

    Returns
    -------
    str | None
        正規化した値。
    """
    if value is None or not value.strip():
        return None
    return value.strip()


def _normalize_chat_tools_name(value: str | None) -> str | None:
    """tools の名前（プロパティ 44。"1"=web_search、"2"=mcp、"0"・空=なし）。

    Parameters
    ----------
    value : str | None
        プロパティの値。

    Returns
    -------
    str | None
        名前。指定なしなら None。
    """
    normalized = _normalize_optional(value)
    if normalized is None or normalized == TOOLS_NAME_NONE:
        return None
    return {TOOLS_NAME_WEB_SEARCH: WEB_SEARCH, TOOLS_NAME_MCP: MCP}.get(
        normalized, normalized
    )


def _normalize_require_approval(value: str | None) -> str | None:
    """MCP の require_approval（プロパティ 47。"1"=never、"2"=always、"0"・空=なし）。

    Parameters
    ----------
    value : str | None
        プロパティの値。

    Returns
    -------
    str | None
        値。指定なしなら None。
    """
    normalized = _normalize_optional(value)
    if normalized is None or normalized == APPROVAL_NONE:
        return None
    return {APPROVAL_NEVER: NEVER, APPROVAL_ALWAYS: "always"}.get(
        normalized, normalized
    )


def _invalid_tools_failure() -> CoreFailure:
    """tools の設定が不正な失敗を作る。

    Returns
    -------
    CoreFailure
        失敗。
    """
    return CoreFailure.of(failures.INVALID_TOOLS_INPUT, INVALID_TOOLS_SUMMARY)


class App:
    """生成AIアダプタ（移植元 App）。"""

    def __init__(self, chat_runtime_factory: ChatRuntimeFactory | None = None) -> None:
        """空の設定で作る。

        Parameters
        ----------
        chat_runtime_factory : ChatRuntimeFactory | None
            core の chat を作る処理（テストでプロバイダを差し替える）。
        """
        self._chat_runtime_factory = chat_runtime_factory
        self.output_dir: str | None = None
        self.reasoning_output_path: str | None = None
        self.output_type: int | None = None
        self.access_credential = AccessCredential()
        self.proxy_setting = ProxySetting()
        self.chat_gpt_parameter = ChatGPTParameter()
        self.text_data_json_file_path: str | None = None
        self.secuaigent_library_generation_off = False
        self.rag_context_json_allow_root: str | None = None
        self.effective_access_credential: AccessCredential | None = None
        self.effective_chat_gpt_parameter: ChatGPTParameter | None = None
        self.text_data_failure: SecuAiGentTextDataFailure | None = None
        self.chat_tools_failure: CoreFailure | None = None
        self.resolved_chat_tools: list[CoreChatTool] = []
        self.chat_tools_name: str | None = None
        self.chat_mcp_server_label: str | None = None
        self.chat_mcp_server_url: str | None = None
        self.chat_mcp_require_approval: str | None = None
        self.chat_tools_json_file_path: str | None = None
        self.image_explanation_mode = ImageExplanationMode.DISABLED
        self.column_information: list[ColumnInformation] = []
        self.view_name: str | None = None
        self._controller: GenerativeAiController | None = None
        self._request_schema_factory: RequestSchemaFactory | None = None

    # ------------------------------------------------------------------
    # 設定
    # ------------------------------------------------------------------
    def validate_column_information(self, column: ColumnInformation) -> bool:
        """列の型がロールに合っているかを確かめる（保存時のチェック）。

        Parameters
        ----------
        column : ColumnInformation
            列の定義。

        Returns
        -------
        bool
            合っていれば True。

        Raises
        ------
        RuntimeError
            4・6 が FILE でない、3・5 が文字でないとき。
        """
        if column.index == INDEX_HISTORY and column.col_type != ColumnType.FILE:
            raise RuntimeError(
                "ロール設定[会話履歴 Json]の場合は型が[FILE]でなければなりません。"
            )
        if column.index == INDEX_RAG_JSON and column.col_type != ColumnType.FILE:
            raise RuntimeError(
                "ロール設定[RAG Context JSONパス]の場合は型が[FILE]でなければなりません。"
            )
        if (
            column.index in (INDEX_CONTEXT_PATH, INDEX_CONTEXT)
            and column.col_type != ColumnType.CHAR
        ):
            raise RuntimeError(
                "ロール設定[ファイルパス]または[コンテクスト]の場合は型が[文字]で"
                "なければなりません。"
            )
        return True

    def validate_property(self, prop_id: int, value: str | None) -> bool:
        """プロパティの値の範囲を確かめる（保存時のチェック。ENUM は確かめない）。

        Parameters
        ----------
        prop_id : int
            プロパティ ID。
        value : str | None
            値。

        Returns
        -------
        bool
            正しければ True。

        Raises
        ------
        RuntimeError
            値が不正なとき（移植元と同じメッセージ）。
        ValueError
            タイムアウトが整数でないとき。
        """
        v = value or ""
        if prop_id == PropertyIds.URL:
            if not _URL_PATTERN.match(v):
                raise RuntimeError(
                    "生成AI URLに不正な値が入力されています。URLを入力してください。"
                    + v
                )
        elif prop_id == PropertyIds.API_KEY:
            if v == "" or any(ch.isspace() for ch in v):
                raise RuntimeError(
                    "生成AI API Keyに不正な値が入力されています。"
                    "空白を含まない値を入力してください。"
                )
        elif prop_id == PropertyIds.OUTPUT_DIR:
            if v and not _WINDOWS_PATH_PATTERN.match(v):
                raise RuntimeError(
                    "出力先ディレクトリに不正な値が入力されています。"
                    "有効なディレクトリパスを入力してください。" + v
                )
        elif prop_id == PropertyIds.REASONING_OUTPUT_PATH:
            if v and not _WINDOWS_PATH_PATTERN.match(v):
                raise RuntimeError(
                    "推論出力先ファイルパスに不正な値が入力されています。"
                    "有効なファイルパスを入力してください。" + v
                )
        elif prop_id == PropertyIds.PROXY_PORT:
            if v:
                try:
                    port = _java_int(v)
                except ValueError:
                    raise RuntimeError(
                        "Proxyポート番号に不正な値が入力されています。"
                        "数値を整数で入力してください。" + v
                    ) from None
                if port < MIN_PORT or port > MAX_PORT:
                    raise RuntimeError(
                        "Proxyポート番号に不正な値が入力されています。"
                        "0~65535の間で指定してください。" + v
                    )
        elif prop_id in (PropertyIds.PROXY_ID, PropertyIds.PROXY_PASS):
            label = (
                "Proxy認証ユーザID"
                if prop_id == PropertyIds.PROXY_ID
                else ("Proxy認証パスワード")
            )
            if v and (not _ALNUM_PATTERN.match(v) or " " in v):
                raise RuntimeError(
                    f"{label}に不正な値が入力されています。英数字で入力してください。"
                    + v
                )
        elif prop_id in (
            PropertyIds.MAX_TOKENS,
            PropertyIds.TEMPERATURE,
            PropertyIds.FREQUENCY_PENALTY,
            PropertyIds.PRESENCE_PENALTY,
            PropertyIds.TOP_P,
        ):
            if v and not _is_number(v):
                raise RuntimeError("数値を入力してください。" + v)
        elif prop_id == PropertyIds.TIMEOUT_SECONDS:
            timeout = _java_int(v)
            if timeout < MIN_TIMEOUT_SECONDS or timeout > MAX_TIMEOUT_SECONDS:
                raise RuntimeError(
                    "タイムアウトの値は60〜86400秒の範囲で指定してください（1分〜1日）"
                )
        return True

    def set_property(self, prop_id: int, value: str | None) -> None:
        """プロパティを受け取る。任意のプロパティの空の値は無視する。

        Parameters
        ----------
        prop_id : int
            プロパティ ID。
        value : str | None
            値。

        Raises
        ------
        ValueError
            数値のプロパティが数値でない、未知のベンダー、
            ライブラリ生成の値が不正なとき。
        """
        if not value and prop_id in _OPTIONAL_PROPERTIES:
            return
        try:
            self._set_property(prop_id, value)
        except property_validation.WahaPropertyValidationError:
            raise
        except ValueError as e:
            if "Invalid SecuAiGent library generation option" in str(e):
                raise
            raise ValueError(
                f"Invalid number format for property ID {prop_id}: {value}"
            ) from e

    def _set_property(self, prop_id: int, value: str | None) -> None:
        """プロパティを項目に入れる（数値の変換の失敗は呼び出し元で包む）。

        Parameters
        ----------
        prop_id : int
            プロパティ ID。
        value : str | None
            値。

        Raises
        ------
        ValueError
            値を変換できないとき。
        """
        text = value or ""
        credential = self.access_credential
        proxy = self.proxy_setting
        parameter = self.chat_gpt_parameter
        match prop_id:
            case PropertyIds.URL:
                credential.url = value
            case PropertyIds.API_KEY:
                credential.api_key = value
            case PropertyIds.MODEL_NAME:
                credential.model_name = value
            case PropertyIds.TENANT_ID:
                credential.tenant_id = None if value is None else value.strip()
            case PropertyIds.USE_PROXY:
                proxy.use_proxy = _java_int(text)
            case PropertyIds.PROXY_HOST:
                proxy.proxy_host = value
            case PropertyIds.PROXY_PORT:
                proxy.proxy_port = NO_PORT if not text else _java_int(text)
            case PropertyIds.USE_PROXY_CRED:
                proxy.use_proxy_cred = text == TRUE_VALUE
            case PropertyIds.PROXY_ID:
                proxy.proxy_id = value
            case PropertyIds.PROXY_PASS:
                proxy.proxy_pass = value
            case PropertyIds.INSECURE_SSL:
                proxy.insecure_ssl_enabled = text == TRUE_VALUE
            case PropertyIds.OUTPUT_DIR:
                self.output_dir = value
            case PropertyIds.REASONING_OUTPUT_PATH:
                self.reasoning_output_path = value
            case PropertyIds.TEXT_DATA_JSON_FILE_PATH:
                self.text_data_json_file_path = value
            case PropertyIds.SECUAIGENT_LIBRARY_GENERATION:
                generation = text.strip()
                if generation in ("", LIBRARY_GENERATION_DEFAULT):
                    self.secuaigent_library_generation_off = False
                elif generation == LIBRARY_GENERATION_OFF:
                    self.secuaigent_library_generation_off = True
                else:
                    raise ValueError(
                        f"Invalid SecuAiGent library generation option: {value}"
                    )
            case PropertyIds.RAG_CONTEXT_JSON_ALLOW_ROOT:
                self.rag_context_json_allow_root = value
            case PropertyIds.CHAT_TOOLS_NAME:
                self.chat_tools_name = value
            case PropertyIds.CHAT_MCP_SERVER_LABEL:
                self.chat_mcp_server_label = value
            case PropertyIds.CHAT_MCP_SERVER_URL:
                self.chat_mcp_server_url = value
            case PropertyIds.CHAT_MCP_REQUIRE_APPROVAL:
                self.chat_mcp_require_approval = value
            case PropertyIds.CHAT_TOOLS_JSON_FILE_PATH:
                self.chat_tools_json_file_path = value
            case PropertyIds.MAX_TOKENS:
                parameter.max_tokens = _java_int(text)
            case PropertyIds.TEMPERATURE:
                parameter.temperature = float(text)
            case PropertyIds.FREQUENCY_PENALTY:
                parameter.frequency_penalty = float(text)
            case PropertyIds.PRESENCE_PENALTY:
                parameter.presence_penalty = float(text)
            case PropertyIds.TOP_P:
                parameter.top_p = float(text)
            case PropertyIds.STOP:
                parameter.stop = value
            case PropertyIds.TIMEOUT_SECONDS:
                credential.timeout_seconds = _java_int(text)
            case PropertyIds.VENDOR:
                credential.vendor_name = vendor.get_vendor_name(value)
            case PropertyIds.IMAGE_EXPLANATION_MODE:
                self.image_explanation_mode = ImageExplanationMode.from_string(value)
            case PropertyIds.REASONING_EFFORT:
                parameter.reasoning_effort = ReasoningEffort.from_string(value)
            case PropertyIds.VERBOSITY:
                parameter.verbosity = Verbosity.from_string(value)

    def test_connect(self) -> bool:
        """接続テスト（移植元どおり、手動プロキシの必須項目だけを確かめる）。

        Returns
        -------
        bool
            常に True。

        Raises
        ------
        RuntimeError
            手動プロキシでホスト・ポートがないとき。
        """
        if self.proxy_setting.use_proxy == 1:
            if not self.proxy_setting.proxy_host:
                raise RuntimeError("Proxy設定が手動の場合はProxyホスト名が必要です。")
            if self.proxy_setting.proxy_port == NO_PORT:
                raise RuntimeError("Proxy設定が手動の場合はProxyポート番号が必要です。")
        return True

    def get_view_names(self) -> list[str]:
        """ビュー名の一覧（移植元どおり固定の案内文）。

        Returns
        -------
        list[str]
            ビュー名の一覧。
        """
        return [VIEW_NAME_PLACEHOLDER]

    def get_column_information(self, view_name: str) -> list[ColumnInformation]:
        """既定の列（ユーザー・システム・アシスタント）。

        Parameters
        ----------
        view_name : str
            ビュー名（使わない）。

        Returns
        -------
        list[ColumnInformation]
            列の定義。
        """
        return [
            ColumnInformation("ユーザー", ColumnType.CHAR, 0),
            ColumnInformation("システム", ColumnType.CHAR, 1),
            ColumnInformation("アシスタント", ColumnType.CHAR, 2),
        ]

    def connect(self, out_mode: int) -> None:
        """出力モードを受け取る（0=チャット用_回答、1=チャット用_コンテクスト、2=回答）。

        Parameters
        ----------
        out_mode : int
            出力モード。
        """
        self.output_type = out_mode

    def set_column_information(self, columns: Sequence[ColumnInformation]) -> None:
        """ビューの列の定義を受け取る。

        Parameters
        ----------
        columns : Sequence[ColumnInformation]
            列の定義。
        """
        self.column_information = list(columns)

    def set_view_name(self, view_name: str) -> None:
        """ビュー名（出力ファイル名）を受け取る。

        Parameters
        ----------
        view_name : str
            ビュー名。
        """
        self.view_name = view_name

    # ------------------------------------------------------------------
    # 実行
    # ------------------------------------------------------------------
    def before_execute(self) -> None:
        """textData・tools を解決し、controller と RequestSchemaFactory を作る。

        textData が不正なら controller を作らず、`write` で失敗を出力する。
        """
        self._prepare_text_data_overlay()
        if self.text_data_failure is not None:
            return
        self._controller = self._init_controller()
        self._request_schema_factory = RequestSchemaFactory(
            self._current_access_credential(),
            self.proxy_setting,
            self.image_explanation_mode,
        )

    def _init_controller(self) -> GenerativeAiController:
        """controller を作る。途中経過ファイルの出力先を渡す。

        Returns
        -------
        GenerativeAiController
            controller。
        """
        credential = self._current_access_credential()
        controller = GenerativeAiController(
            credential,
            self.proxy_setting,
            self._output_type(),
            self.resolved_chat_tools,
            self._chat_runtime_factory,
        )
        controller.reasoning_output_path = credential.secuaigent_stream_file_path
        return controller

    def _output_type(self) -> int:
        """出力モード（connect の前なら 0）。

        Returns
        -------
        int
            出力モード。
        """
        return 0 if self.output_type is None else self.output_type

    def _is_secuaigent(self) -> bool:
        """プロバイダが SecuAiGent かを返す。

        Returns
        -------
        bool
            SecuAiGent なら True。
        """
        return self.access_credential.vendor_name == SECUAIGENT

    def _prepare_text_data_overlay(self) -> None:
        """textData を読み、SecuAiGent なら資格情報・生成パラメータを上書きする。

        - ライブラリ生成オフ（プロパティ 49）なら createLibrary=false・messageId なしにする
        - createLibrary=true で messageId がなければ textData の失敗にする
        - 途中経過ファイルは textData の streamfilepath を優先し、なければプロパティ 42
        - textData が使えれば tools を解決する
        """
        self.text_data_failure = None
        self.chat_tools_failure = None
        self.resolved_chat_tools = []
        self.effective_access_credential = self.access_credential
        self.effective_chat_gpt_parameter = self.chat_gpt_parameter
        text_data_tools: tuple[CoreChatTool, ...] = ()
        text_data_tools_specified = False
        try:
            document = None
            if self.text_data_json_file_path and self.text_data_json_file_path.strip():
                document = load_text_data_document(self.text_data_json_file_path)
            if document is not None:
                if document.tools_specified:
                    text_data_tools_specified = True
                    text_data_tools = document.tools
                if self._is_secuaigent():
                    self.effective_access_credential = apply_credential(
                        self.access_credential, document
                    )
                    self.effective_chat_gpt_parameter = apply_parameter(
                        self.chat_gpt_parameter, document
                    )
            if self._is_secuaigent() and self.secuaigent_library_generation_off:
                if self.effective_access_credential is self.access_credential:
                    self.effective_access_credential = apply_credential(
                        self.access_credential, None
                    )
                self.effective_access_credential.secuaigent_create_library = False
                self.effective_access_credential.secuaigent_message_id = None
            effective = self.effective_access_credential
            message_id = effective.secuaigent_message_id
            if (
                self._is_secuaigent()
                and effective.secuaigent_create_library is True
                and (message_id is None or not message_id.strip())
            ):
                raise SecuAiGentTextDataFailure()
            self._apply_reasoning_output_path_fallback()
        except SecuAiGentTextDataFailure as failure:
            self.text_data_failure = failure
            logger.error(failure.safe_message)
        if self.text_data_failure is None:
            self._resolve_chat_tools(text_data_tools, text_data_tools_specified)
        logger.info(
            "beforeExecute: vendor=%s, textData=%s, textDataFailure=%s, tools=%d, "
            "toolsFailure=%s, reasoningOutput=%s",
            self.access_credential.vendor_name,
            bool(self.text_data_json_file_path),
            self.text_data_failure is not None,
            len(self.resolved_chat_tools),
            None if self.chat_tools_failure is None else self.chat_tools_failure.code,
            bool(self._current_access_credential().secuaigent_stream_file_path),
        )

    def _apply_reasoning_output_path_fallback(self) -> None:
        """textData に streamfilepath がなければ、プロパティ 42 を途中経過ファイルにする。"""
        credential = self._current_access_credential()
        path = credential.secuaigent_stream_file_path
        if (path is None or not path.strip()) and (
            self.reasoning_output_path and self.reasoning_output_path.strip()
        ):
            if credential is self.access_credential:
                # プロパティの値を書き換えないよう、写しに入れる
                credential = apply_credential(self.access_credential, None)
                self.effective_access_credential = credential
            credential.secuaigent_stream_file_path = self.reasoning_output_path

    def _resolve_chat_tools(
        self, text_data_tools: Sequence[CoreChatTool], text_data_tools_specified: bool
    ) -> None:
        """tools を解決する（textData → tools JSON → プロパティ 44〜47 の順）。

        tools は通常 chat かつ SecuAiGent だけ。JSON で `tools: []` ならプロパティに
        戻らない。不正なら `chat_tools_failure` に入れる。

        Parameters
        ----------
        text_data_tools : Sequence[CoreChatTool]
            textData の tools。
        text_data_tools_specified : bool
            textData に tools の項目があったか。
        """
        tools_json_specified = bool(
            self.chat_tools_json_file_path and self.chat_tools_json_file_path.strip()
        )
        property_tools_specified = (
            _normalize_chat_tools_name(self.chat_tools_name) is not None
        )
        if not (
            text_data_tools_specified
            or tools_json_specified
            or property_tools_specified
        ):
            return
        if self._output_type() not in NORMAL_CHAT_OUTPUT_TYPES:
            self.chat_tools_failure = CoreFailure.of(
                failures.UNSUPPORTED_TOOLS_ROUTE, UNSUPPORTED_TOOLS_ROUTE_SUMMARY
            )
            return
        if not self._is_secuaigent():
            self.chat_tools_failure = CoreFailure.of(
                failures.UNSUPPORTED_TOOLS_PROVIDER, UNSUPPORTED_TOOLS_PROVIDER_SUMMARY
            )
            return
        if text_data_tools_specified or tools_json_specified:
            try:
                tools_json: tuple[CoreChatTool, ...] = ()
                if tools_json_specified and self.chat_tools_json_file_path is not None:
                    tools_json = load_tools_json(self.chat_tools_json_file_path)
                self.resolved_chat_tools = merge_chat_tools(text_data_tools, tools_json)
            except SecuAiGentTextDataFailure:
                self.chat_tools_failure = _invalid_tools_failure()
                logger.error(self.chat_tools_failure.summary)
            return
        self._resolve_property_chat_tools()

    def _resolve_property_chat_tools(self) -> None:
        """プロパティ 44〜47 から tools を作る。"""
        name = _normalize_chat_tools_name(self.chat_tools_name)
        if name is None:
            return
        if name == WEB_SEARCH:
            self.resolved_chat_tools = [CoreChatTool.web_search()]
            return
        if name != MCP:
            self.chat_tools_failure = _invalid_tools_failure()
            return
        label = _normalize_optional(self.chat_mcp_server_label)
        url = _normalize_optional(self.chat_mcp_server_url)
        if label is None or url is None:
            self.chat_tools_failure = _invalid_tools_failure()
            return
        approval = _normalize_require_approval(self.chat_mcp_require_approval)
        if approval is not None and approval != NEVER:
            self.chat_tools_failure = _invalid_tools_failure()
            return
        self.resolved_chat_tools = [CoreChatTool.mcp(label, url, approval)]

    def _current_access_credential(self) -> AccessCredential:
        """textData で上書きした資格情報（なければプロパティのもの）。

        Returns
        -------
        AccessCredential
            資格情報。
        """
        return self.effective_access_credential or self.access_credential

    def _current_chat_gpt_parameter(self) -> ChatGPTParameter:
        """textData で上書きした生成パラメータ（なければプロパティのもの）。

        Returns
        -------
        ChatGPTParameter
            生成パラメータ。
        """
        return self.effective_chat_gpt_parameter or self.chat_gpt_parameter

    def _output_path(self) -> str:
        """出力ファイルのパス（`OUTPUT_DIR/<ビュー名>`）。

        Returns
        -------
        str
            パス。
        """
        return f"{self.output_dir}/{self.view_name}"

    def write(self, record: Sequence[ColumnData]) -> None:
        """1 レコードを処理する（通常 chat か RAG）。

        textData・tools の失敗が先にあれば、それを出力して終わる。

        Parameters
        ----------
        record : Sequence[ColumnData]
            列の値（`set_column_information` の列と同じ順）。

        Raises
        ------
        RuntimeError
            実行・書き込みに失敗したとき。
        WahaPropertyValidationError
            必須のプロパティがない・実行できないプロバイダの
            とき。
        """
        output_path = self._output_path()
        try:
            if self.text_data_failure is not None:
                self._write_failure_message(
                    self.text_data_failure.safe_message, output_path
                )
                return
            if self.chat_tools_failure is not None:
                failure = self.chat_tools_failure
                self._write_failure_message(
                    f"{failure.code}: {failure.summary}", output_path
                )
                return
            if self._controller is None or self._request_schema_factory is None:
                raise RuntimeError("beforeExecute has not been called")
            if self._output_type() in NORMAL_CHAT_OUTPUT_TYPES:
                logger.info("write: route=chat, outputType=%d", self._output_type())
                self._validate_normal_answer_runtime_properties()
                schema = self._request_schema_factory.create_request_schema(
                    self._current_access_credential().model_name,
                    record,
                    self.column_information,
                    self._current_chat_gpt_parameter(),
                )
                self._controller.execute_llm(schema, output_path)
            else:
                logger.info("write: route=rag, outputType=%d", self._output_type())
                schema = self._create_rag_request_schema(record)
                self._controller.execute_llm_with_context(schema, output_path)
        except Exception:
            logger.exception("writeでエラーが発生しました。")
            raise

    def _validate_normal_answer_runtime_properties(self) -> None:
        """通常 chat に必要なプロパティ（モデル名・出力先・実行できるプロバイダ）を確かめる。

        Raises
        ------
        WahaPropertyValidationError
            足りない・実行できないとき。
        """
        _validate_required(
            self.access_credential.model_name, PropertyIds.MODEL_NAME, "model"
        )
        _validate_required(self.output_dir, PropertyIds.OUTPUT_DIR, "outputDir")
        vendor.validate_runnable_provider(self.access_credential.vendor_name)

    def _create_rag_request_schema(self, record: Sequence[ColumnData]) -> RequestSchema:
        """RAG のリクエストを作る。index 6 があれば RAG Context JSON、なければ旧経路。

        Parameters
        ----------
        record : Sequence[ColumnData]
            列の値。

        Returns
        -------
        RequestSchema
            リクエスト。

        Raises
        ------
        RagContextJsonInputError
            RAG Context JSON が不正なとき。
        """
        rag_json_path = _column_text(record, self.column_information, INDEX_RAG_JSON)
        if _is_skipped_file_path(rag_json_path):
            if self._request_schema_factory is None:
                raise RuntimeError("beforeExecute has not been called")
            return self._request_schema_factory.create_request_schema_with_context(
                self._current_access_credential().model_name,
                record,
                self.column_information,
                self._current_chat_gpt_parameter(),
            )
        allow_root = _normalize_optional(self.rag_context_json_allow_root)
        logger.info("RAG Context JSON: allowRoot=%s", allow_root is not None)
        return rag_context_json.from_inline(
            None,
            rag_context_json.RagContextJsonInputPath(
                rag_json_path, None if allow_root is None else Path(allow_root)
            ),
            _extract_user_question(record),
        )

    def _write_failure_message(self, message: str, output_path: str) -> None:
        """textData・tools の失敗を出力モードに合わせて書く。

        Parameters
        ----------
        message : str
            失敗のメッセージ。
        output_path : str
            出力ファイルのパス。

        Raises
        ------
        RuntimeError
            書けないとき。
        """
        try:
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            if self._output_type() == PLAIN_ANSWER_OUTPUT_TYPE:
                path.write_text(message, encoding="utf-8")
            else:
                path.write_text(
                    RetrievalAnswer(answer=message).to_json(), encoding="utf-8"
                )
        except OSError as e:
            raise RuntimeError(
                "TOOLS_FAILURE_WRITE_FAILED: failed to write sanitized failure."
            ) from e


def _validate_required(value: str | None, property_id: int, name: str) -> None:
    """必須のプロパティがあることを確かめる。

    Parameters
    ----------
    value : str | None
        値。
    property_id : int
        プロパティ ID。
    name : str
        項目名。

    Raises
    ------
    WahaPropertyValidationError
        ないとき。
    """
    if value is None or not value.strip():
        raise property_validation.missing(property_id, name)


def _column_text(
    record: Sequence[ColumnData],
    columns: Sequence[ColumnInformation],
    index: int,
) -> str | None:
    """指定のロールの列の値（文字列）を返す。

    Parameters
    ----------
    record : Sequence[ColumnData]
        列の値。
    columns : Sequence[ColumnInformation]
        列の定義。
    index : int
        ロール。

    Returns
    -------
    str | None
        値。列がなければ None。
    """
    for data, info in zip(record, columns, strict=False):
        if info.index == index and data is not None:
            if data.s is not None:
                return data.s
            if data.b_ary is not None:
                return data.b_ary.decode("utf-8")
            return None
    return None


def _is_skipped_file_path(file_path: str | None) -> bool:
    """index 6 がない・空・`null`（`…/null`・`…\\null`）かを返す。

    Parameters
    ----------
    file_path : str | None
        値。

    Returns
    -------
    bool
        ファイルなしなら True。
    """
    if file_path is None or not file_path.strip():
        return True
    trimmed = file_path.strip()
    return trimmed == "null" or trimmed.endswith(("\\null", "/null"))


def _extract_user_question(record: Sequence[ColumnData]) -> str:
    """先頭の列の文字列を質問として返す（移植元どおり先頭の列だけを見る）。

    Parameters
    ----------
    record : Sequence[ColumnData]
        列の値。

    Returns
    -------
    str
        質問。文字の列でなければ空文字列。
    """
    if not record or record[0] is None or record[0].s is None:
        return ""
    return record[0].s
