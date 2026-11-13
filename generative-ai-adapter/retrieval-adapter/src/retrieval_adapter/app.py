"""検索アダプタの入口（移植元 App。Waha! の Adapter 実装）。

Waha! は `set_property` → `connect` → `set_column_information` → `set_view_name` →
`before_execute` → `write`（レコードごと）の順に呼ぶ。Python 版ではこの順序と各メソッドの
挙動を保ち、Waha! 固有の受け口だけを置き換える。

- プロパティ: ID と文字列の値（`constants.RetrievalPropertyIds`）
- レコード: バイト列ではなく `ColumnData` の列（`waha.py`）
- 出力: `OUTPUT_DIR/<ビュー名>` に書く（出力モードで TSV か RAG Context JSON）
"""

import logging
import re
from collections.abc import Callable, Sequence

from generative_ai_core.media import CoreMediaPreprocessingMode
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataFailure,
    CoreSecuAiGentTextDataLoader,
)
from generative_ai_core.retrieval.runtime import CoreRetrievalRuntime

from retrieval_adapter.adapterconfig import (
    RetrievalNetworkProperties,
    RetrievalProviderProperties,
    RetrievalVectorDbProperties,
)
from retrieval_adapter.constants import (
    RERANK_VENDOR_NAMES,
    VDB_VENDOR_NAMES,
    VENDOR_NAMES,
    RetrievalPropertyIds,
)
from retrieval_adapter.controller import DEFAULT_MAX_RESULT, RetrievalController
from retrieval_adapter.output_format import RetrievalOutputFormat
from retrieval_adapter.settings import (
    GraphRagSearchSetting,
    HybridRetrievalEnablementSetting,
    validate_graph_name,
)
from retrieval_adapter.waha import ColumnData, ColumnInformation, ColumnType

logger = logging.getLogger(__name__)

SECUAIGENT = "SecuAiGent"
NO_PORT = -1
MIN_PORT = 0
MAX_PORT = 65535
MIN_TIMEOUT_SECONDS = 60
MAX_TIMEOUT_SECONDS = 86400
VIEW_NAME_PLACEHOLDER = "インポート後に出力するファイル名に置き換えてください。"
_URL_PATTERN = re.compile(r"(http|https)://.*", re.DOTALL)
_WINDOWS_PATH_PATTERN = re.compile(r"[a-zA-Z]:\\.*", re.DOTALL)
_ALNUM_PATTERN = re.compile(r"[a-zA-Z0-9]+")
_DIGITS_PATTERN = re.compile(r"[0-9]+")
_TENANT_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_JAVA_INT = re.compile(r"[+-]?\d+")

RuntimeFactory = Callable[[], CoreRetrievalRuntime]


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
    if not _JAVA_INT.fullmatch(value):
        raise ValueError(f'For input string: "{value}"')
    return int(value)


def _has_whitespace(value: str) -> bool:
    """空白文字を含むかを返す。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    bool
        含めば True。
    """
    return any(ch.isspace() for ch in value)


def _media_mode(value: str | None) -> CoreMediaPreprocessingMode:
    """プロパティ 32 の値（0=無効、1=EMBED_ONLY、2=FULL_PAGE）をモードにする。

    Parameters
    ----------
    value : str | None
        値。

    Returns
    -------
    CoreMediaPreprocessingMode
        モード。空と未知の数値は無効。

    Raises
    ------
    ValueError
        数字でないとき。
    """
    if value is None or value == "":
        return CoreMediaPreprocessingMode.DISABLED
    code = _java_int(value)
    modes = {
        0: CoreMediaPreprocessingMode.DISABLED,
        1: CoreMediaPreprocessingMode.EMBED_ONLY,
        2: CoreMediaPreprocessingMode.FULL_PAGE,
    }
    return modes.get(code, CoreMediaPreprocessingMode.DISABLED)


def _parse_core_timeout_seconds(value: str, property_name: str) -> int:
    """タイムアウト秒（60〜86400）を読む。

    Parameters
    ----------
    value : str
        値。
    property_name : str
        エラーメッセージに使うプロパティ名。

    Returns
    -------
    int
        秒数。

    Raises
    ------
    RuntimeError
        数字でない・範囲外のとき。
    """
    try:
        parsed = _java_int(value.strip())
    except ValueError as e:
        raise RuntimeError(f"{property_name} must be numeric.") from e
    if parsed < MIN_TIMEOUT_SECONDS or parsed > MAX_TIMEOUT_SECONDS:
        raise RuntimeError(f"{property_name} must be between 60 and 86400.")
    return parsed


def _require_text(value: str | None, property_name: str, missing: list[str]) -> None:
    """値が空なら不足の一覧にプロパティ名を足す。

    Parameters
    ----------
    value : str | None
        値。
    property_name : str
        プロパティ名。
    missing : list[str]
        不足の一覧（書き込み先）。
    """
    if value is None or not value.strip():
        missing.append(property_name)


class App:
    """Waha! の検索アダプタ。"""

    def __init__(self, runtime_factory: RuntimeFactory | None = None) -> None:
        """状態を初期化する。

        Parameters
        ----------
        runtime_factory : RuntimeFactory | None
            core の検索を作る関数（テストでプロバイダ・DB を差し替える）。省略すると既定。
        """
        self._runtime_factory = runtime_factory
        self.output_dir: str | None = None
        self.access_credential = RetrievalProviderProperties()
        self.rerank_properties = RetrievalProviderProperties()
        self.effective_properties: RetrievalProviderProperties | None = None
        self.text_data_json_file_path: str | None = None
        self.proxy_setting = RetrievalNetworkProperties()
        self.retrieval_controller: RetrievalController | None = None
        self.vector_db_config = RetrievalVectorDbProperties()
        self.max_result = DEFAULT_MAX_RESULT
        self.image_explanation_mode = CoreMediaPreprocessingMode.DISABLED
        self.graph_rag_search_enabled = False
        self.graph_rag_graph_name: str | None = None
        self.hybrid_setting = HybridRetrievalEnablementSetting.disabled()
        self.provider_llm_rerank_enabled = True
        self.output_format = RetrievalOutputFormat.LEGACY_TSV
        self.column_information: Sequence[ColumnInformation] = ()
        self.view_name: str | None = None

    def validate_column_information(self, column: ColumnInformation) -> bool:
        """列の設定値の保存用チェック（常に通す）。

        Parameters
        ----------
        column : ColumnInformation
            列の定義。

        Returns
        -------
        bool
            常に True。
        """
        return True

    def validate_property(self, prop_id: int, value: str | None) -> bool:
        """プロパティの値の保存用チェック（実行時のチェックではない）。

        Parameters
        ----------
        prop_id : int
            プロパティ ID。
        value : str | None
            値。None は空文字として扱う。

        Returns
        -------
        bool
            通れば True。

        Raises
        ------
        RuntimeError
            値が不正なとき（メッセージは Waha! の画面に出る）。
        """
        v = "" if value is None else value
        ids = RetrievalPropertyIds
        if prop_id == ids.URL:
            if not _URL_PATTERN.fullmatch(v):
                raise RuntimeError(
                    "エンベディング URLに不正な値が入力されています。URLを入力してください。"
                )
        elif prop_id == ids.API_KEY:
            if v == "" or _has_whitespace(v):
                raise RuntimeError(
                    "エンベディング API Keyに不正な値が入力されています。"
                    "空白を含まない値を入力してください。"
                )
        elif prop_id == ids.TENANT_ID:
            self._validate_tenant_id(v)
        elif prop_id == ids.OUTPUT_DIR:
            if v != "" and not _WINDOWS_PATH_PATTERN.fullmatch(v):
                raise RuntimeError(
                    "出力先ディレクトリに不正な値が入力されています。"
                    f"有効なディレクトリパスを入力してください。{v}"
                )
        elif prop_id == ids.PROXY_PORT:
            self._validate_proxy_port(v)
        elif prop_id in (ids.PROXY_ID, ids.PROXY_PASS):
            if v != "" and (not _ALNUM_PATTERN.fullmatch(v) or " " in v):
                label = "ユーザID" if prop_id == ids.PROXY_ID else "パスワード"
                raise RuntimeError(
                    f"Proxy認証{label}に不正な値が入力されています。英数字で入力してください。"
                )
        elif prop_id == ids.SEARCH_COUNT:
            if v != "" and (not _DIGITS_PATTERN.fullmatch(v) or " " in v):
                raise RuntimeError(
                    f"検索クエリ数に不正な値が入力されています。数字で入力してください。{v}"
                )
        elif prop_id == ids.AGE_GRAPH_NAME:
            if v != "":
                validate_graph_name(v)
        elif prop_id == ids.HYBRID_RETRIEVAL_ENABLED:
            return HybridRetrievalEnablementSetting.is_valid_property_value(v)
        elif prop_id == ids.EMBEDDING_DIMENSIONS:
            self._validate_embedding_dimensions(v)
        elif prop_id == ids.PROVIDER_LLM_RERANK_ENABLED:
            return v in ("", "0", "1")
        elif prop_id == ids.PROVIDER_LLM_RERANK_PROVIDER:
            return v in ("", "0", "1", "5")
        elif prop_id == ids.PROVIDER_LLM_RERANK_TIMEOUT_SECONDS and v != "":
            _parse_core_timeout_seconds(v, "LLM rerank timeout seconds")
        return True

    @staticmethod
    def _validate_proxy_port(value: str) -> None:
        """Proxy ポート番号を検証する。

        Parameters
        ----------
        value : str
            値。

        Raises
        ------
        RuntimeError
            整数でない、または 0〜65535 でないとき。
        """
        if value == "":
            return
        try:
            port = _java_int(value)
        except ValueError as e:
            raise RuntimeError(
                "Proxyポート番号に不正な値が入力されています。数値を整数で入力してください。"
            ) from e
        if port < MIN_PORT or port > MAX_PORT:
            raise RuntimeError(
                "Proxyポート番号に不正な値が入力されています。0~65535の間で指定してください。"
            )

    @staticmethod
    def _validate_tenant_id(value: str) -> None:
        """Tenant ID を検証する（空は許す）。

        Parameters
        ----------
        value : str
            値。

        Raises
        ------
        RuntimeError
            許可された形式でないとき。
        """
        normalized = value.strip()
        if normalized and not _TENANT_ID_PATTERN.fullmatch(normalized):
            raise RuntimeError("Tenant ID に不正な値が入力されています。")

    @staticmethod
    def _validate_embedding_dimensions(value: str) -> None:
        """Embedding dimensions を検証する（空は許す）。

        Parameters
        ----------
        value : str
            値。

        Raises
        ------
        RuntimeError
            正の整数でないとき。
        """
        if not value.strip():
            return
        try:
            valid = _java_int(value.strip()) > 0
        except ValueError:
            valid = False
        if not valid:
            raise RuntimeError(
                "Embedding dimensions に不正な値が入力されています。正の整数を入力してください。"
            )

    def set_property(self, prop_id: int, value: str | None) -> None:
        """プロパティの値を受け取る（検証は `validate_property`）。

        Parameters
        ----------
        prop_id : int
            プロパティ ID。
        value : str | None
            値。None は空文字として扱う。

        Raises
        ------
        ValueError
            ベンダー ID が未知、または数値の形が不正なとき。
        RuntimeError
            検索クエリ数・リランクのタイムアウトが不正なとき。
        """
        v = "" if value is None else value
        ids = RetrievalPropertyIds
        credential = self.access_credential
        proxy = self.proxy_setting
        db = self.vector_db_config
        rerank = self.rerank_properties
        if prop_id == ids.URL:
            credential.url = v
        elif prop_id == ids.API_KEY:
            credential.api_key = v
        elif prop_id == ids.MODEL_NAME:
            credential.model_name = v
        elif prop_id == ids.TENANT_ID:
            credential.tenant_id = v.strip()
        elif prop_id == ids.USE_PROXY:
            proxy.use_proxy = _java_int(v)
        elif prop_id == ids.PROXY_HOST:
            proxy.proxy_host = v
        elif prop_id == ids.PROXY_PORT:
            proxy.proxy_port = _java_int(v) if v != "" else NO_PORT
        elif prop_id == ids.USE_PROXY_CRED:
            proxy.use_proxy_cred = v == "1"
        elif prop_id == ids.PROXY_ID:
            proxy.proxy_id = v
        elif prop_id == ids.PROXY_PASS:
            proxy.proxy_pass = v
        elif prop_id == ids.INSECURE_SSL:
            proxy.insecure_ssl_enabled = v == "1"
        elif prop_id == ids.OUTPUT_DIR:
            self.output_dir = v
        elif prop_id == ids.VDB_URL:
            db.url = v
        elif prop_id == ids.VDB_API_KEY:
            db.api_key = v
        elif prop_id == ids.VDB_INDEX_NAME:
            db.index_name = v
        elif prop_id == ids.SEARCH_COUNT:
            self.max_result = self._parse_search_count(v)
        elif prop_id == ids.VENDOR:
            credential.vendor_name = self._vendor_name(
                VENDOR_NAMES, v, "Unsupported vendor ID: "
            )
        elif prop_id == ids.VDB_VENDOR:
            db.vendor_name = self._vendor_name(
                VDB_VENDOR_NAMES, v, "Unsupported vendor ID: "
            )
        elif prop_id == ids.IMAGE_EXPLANATION_MODE:
            self.image_explanation_mode = _media_mode(v)
        elif prop_id == ids.VDB_USER_NAME:
            db.user_name = v
        elif prop_id == ids.VDB_PASSWORD:
            db.password = v
        elif prop_id == ids.VDB_DATABASE_NAME:
            db.database_name = v
        elif prop_id == ids.VDB_TABLE_NAME:
            db.table_name = v
        elif prop_id == ids.GRAPH_RAG_ENABLED:
            self.graph_rag_search_enabled = GraphRagSearchSetting.parse_enabled(v)
        elif prop_id == ids.AGE_GRAPH_NAME:
            self.graph_rag_graph_name = v
        elif prop_id == ids.HYBRID_RETRIEVAL_ENABLED:
            self.hybrid_setting = HybridRetrievalEnablementSetting.from_property(v)
        elif prop_id == ids.EMBEDDING_DIMENSIONS:
            credential.embedding_dimensions = (
                None if not v.strip() else _java_int(v.strip())
            )
        elif prop_id == ids.TEXT_DATA_JSON_FILE_PATH:
            self.text_data_json_file_path = v
        else:
            self._set_rerank_property(rerank, prop_id, v)

    def _set_rerank_property(
        self, rerank: RetrievalProviderProperties, prop_id: int, v: str
    ) -> None:
        """リランクのプロパティ（53〜59）を受け取る。

        Parameters
        ----------
        rerank : RetrievalProviderProperties
            リランクのプロバイダのプロパティ。
        prop_id : int
            プロパティ ID。
        v : str
            値。

        Raises
        ------
        ValueError
            リランクのプロバイダ ID が未知のとき。
        RuntimeError
            タイムアウトが不正なとき。
        """
        ids = RetrievalPropertyIds
        if prop_id == ids.PROVIDER_LLM_RERANK_ENABLED:
            self.provider_llm_rerank_enabled = v != "0"
        elif prop_id == ids.PROVIDER_LLM_RERANK_PROVIDER:
            rerank.vendor_name = (
                None
                if v == ""
                else self._vendor_name(
                    RERANK_VENDOR_NAMES, v, "Unsupported rerank provider ID: "
                )
            )
        elif prop_id == ids.PROVIDER_LLM_RERANK_URL:
            rerank.url = v
        elif prop_id == ids.PROVIDER_LLM_RERANK_API_KEY:
            rerank.api_key = v
        elif prop_id == ids.PROVIDER_LLM_RERANK_MODEL:
            rerank.model_name = v
        elif prop_id == ids.PROVIDER_LLM_RERANK_TENANT_ID:
            rerank.tenant_id = v.strip()
        elif prop_id == ids.PROVIDER_LLM_RERANK_TIMEOUT_SECONDS and v.strip():
            rerank.timeout_seconds = _parse_core_timeout_seconds(
                v, "LLM rerank timeout seconds"
            )

    @staticmethod
    def _vendor_name(names: dict[str, str], value: str, message: str) -> str:
        """ID からベンダー名を引く。

        Parameters
        ----------
        names : dict[str, str]
            ID → ベンダー名。
        value : str
            ID。
        message : str
            未知のときのメッセージの前半。

        Returns
        -------
        str
            ベンダー名。

        Raises
        ------
        ValueError
            未知の ID のとき。
        """
        name = names.get(value)
        if name is None:
            raise ValueError(f"{message}{value}")
        return name

    @staticmethod
    def _parse_search_count(value: str) -> int:
        """検索クエリ数を読む（空は 3）。

        Parameters
        ----------
        value : str
            値。

        Returns
        -------
        int
            検索クエリ数。

        Raises
        ------
        RuntimeError
            整数でないとき。
        """
        if not value.strip():
            return DEFAULT_MAX_RESULT
        try:
            return _java_int(value.strip())
        except ValueError as e:
            raise RuntimeError(
                "検索クエリ数に不正な値が入力されています。数字で入力してください。"
            ) from e

    def test_connect(self) -> bool:
        """接続テスト（手動プロキシのホスト・ポートがあるかだけ確かめる）。

        Returns
        -------
        bool
            通れば True。

        Raises
        ------
        RuntimeError
            手動プロキシでホスト名またはポート番号がないとき。
        """
        if self.proxy_setting.use_proxy == 1:
            if not self.proxy_setting.proxy_host:
                raise RuntimeError("Proxy設定が手動の場合はProxyホスト名が必要です。")
            if self.proxy_setting.proxy_port == NO_PORT:
                raise RuntimeError("Proxy設定が手動の場合はProxyポート番号が必要です。")
        return True

    def get_view_names(self) -> list[str]:
        """ビュー名の一覧（出力ファイル名の置き換えを促す固定の文字列）を返す。

        Returns
        -------
        list[str]
            ビュー名。
        """
        return [VIEW_NAME_PLACEHOLDER]

    def get_column_information(self, view_name: str) -> list[ColumnInformation]:
        """ビューの列の定義（検索文字列の FILE 列 1 つ）を返す。

        Parameters
        ----------
        view_name : str
            ビュー名（使わない）。

        Returns
        -------
        list[ColumnInformation]
            列の定義。
        """
        return [ColumnInformation("検索文字列", ColumnType.FILE, 0)]

    def connect(self, out_mode: int) -> None:
        """出力モードを受け取る（0=LEGACY_TSV、1=RAG_CONTEXT_JSON_V1）。

        Parameters
        ----------
        out_mode : int
            出力モード。

        Raises
        ------
        ValueError
            0・1 以外のとき。
        """
        self.output_format = RetrievalOutputFormat.from_out_mode(out_mode)

    def disconnect(self) -> None:
        """切断する（何もしない）。"""

    def set_column_information(self, columns: Sequence[ColumnInformation]) -> None:
        """ビューの列の定義を受け取る。

        Parameters
        ----------
        columns : Sequence[ColumnInformation]
            列の定義。
        """
        self.column_information = columns

    def set_view_name(self, view_name: str) -> None:
        """ビュー名（出力ファイル名）を受け取る。

        Parameters
        ----------
        view_name : str
            ビュー名。
        """
        self.view_name = view_name

    def before_execute(self) -> None:
        """実行前の準備（textData の反映と、コントローラーの作成）。"""
        self._prepare_text_data_overlay()
        if self.retrieval_controller is None:
            self.retrieval_controller = self.init_retrieval_controller()

    def after_execute(self) -> None:
        """書き込み後の処理（何もしない）。"""

    def write(self, record: Sequence[ColumnData]) -> None:
        """1 レコード分を受け取り、検索して出力ファイルに書く。

        Parameters
        ----------
        record : Sequence[ColumnData]
            レコードの列の値。

        Raises
        ------
        RuntimeError
            検索や書き込みに失敗したとき（原因を連鎖させる）。
        """
        controller = self.retrieval_controller
        try:
            if controller is None:
                raise RuntimeError("retrieval controller is not initialized")
            controller.find_related_embeddings(
                record,
                self.column_information,
                f"{self.output_dir}/{self.view_name}",
                self.max_result,
                self.output_format,
            )
        except Exception as e:
            # 移植元と同じく RuntimeException に包んで返す
            raise RuntimeError(str(e)) from e

    def init_retrieval_controller(self) -> RetrievalController:
        """プロパティを検証してコントローラーを作る。

        Returns
        -------
        RetrievalController
            コントローラー。

        Raises
        ------
        RuntimeError
            必須のプロパティが足りない、GraphRAG・ハイブリッドが PostgreSQL 以外のとき。
        ValueError
            graph 名などが不正なとき。
        """
        if self.effective_properties is None:
            self._prepare_text_data_overlay()
        self._validate_retrieval_runtime_properties()
        graph_setting = GraphRagSearchSetting.from_properties(
            self.graph_rag_search_enabled,
            self.graph_rag_graph_name,
            self.vector_db_config.vendor_name,
            self.vector_db_config.table_name,
        )
        runtime = self._runtime_factory() if self._runtime_factory else None
        return RetrievalController(
            self.proxy_setting,
            self._current_properties(),
            self.vector_db_config,
            self.image_explanation_mode,
            graph_setting,
            self.hybrid_setting,
            self.rerank_properties,
            self.provider_llm_rerank_enabled,
            runtime,
        )

    def _validate_retrieval_runtime_properties(self) -> None:
        """実行時に必須のプロパティを確かめる。

        Raises
        ------
        RuntimeError
            必須のプロパティが足りない、GraphRAG・ハイブリッドが PostgreSQL 以外のとき。
        """
        if self._current_properties().vendor_name == SECUAIGENT:
            self._validate_secuaigent_retrieval_properties()
        if (
            self.graph_rag_search_enabled or self.hybrid_setting.enabled
        ) and not self.vector_db_config.is_postgresql_provider():
            raise RuntimeError(
                "GraphRAG and Hybrid retrieval are available only for PostgreSQL(PGVector)."
            )
        if self.vector_db_config.is_postgresql_provider():
            self._validate_postgresql_connection_properties()
        if self.graph_rag_search_enabled:
            self.vector_db_config.get_effective_graph_name()
        self.vector_db_config.get_effective_index_name()

    def _validate_secuaigent_retrieval_properties(self) -> None:
        """SecuAiGent の検索に必須のプロパティを確かめる。

        Raises
        ------
        RuntimeError
            足りないプロパティがあるとき。
        """
        credential = self._current_properties()
        missing: list[str] = []
        _require_text(credential.url, "property 0 embedding URL", missing)
        _require_text(credential.api_key, "property 1 embedding API key", missing)
        _require_text(credential.model_name, "property 2 embedding model", missing)
        _require_text(credential.tenant_id, "property 3 Tenant ID", missing)
        if missing:
            raise RuntimeError(
                "SecuAiGent retrieval properties are required before retrieval runtime: "
                + ", ".join(missing)
            )

    def _validate_postgresql_connection_properties(self) -> None:
        """PostgreSQL の接続に必須のプロパティを確かめる。

        Raises
        ------
        RuntimeError
            足りないプロパティがあるとき。
        """
        db = self.vector_db_config
        missing: list[str] = []
        _require_text(db.url, "property 12 PostgreSQL host/port endpoint", missing)
        _require_text(db.user_name, "property 41 PostgreSQL user", missing)
        _require_text(db.password, "property 42 PostgreSQL password", missing)
        _require_text(db.database_name, "property 43 PostgreSQL database", missing)
        _require_text(db.table_name, "property 44 PostgreSQL table", missing)
        if missing:
            raise RuntimeError(
                "PostgreSQL(PGVector) connection properties are required before "
                "retrieval runtime: " + ", ".join(missing)
            )

    def _prepare_text_data_overlay(self) -> None:
        """SecuAiGent で textData があれば、URL・トークン・テナントなどを上書きする。

        Raises
        ------
        CoreSecuAiGentTextDataFailure
            textData が不正なとき。
        """
        self.effective_properties = self.access_credential
        if not self._is_secuaigent_text_data_enabled():
            return
        try:
            document = CoreSecuAiGentTextDataLoader().load(
                self.text_data_json_file_path
            )
        except CoreSecuAiGentTextDataFailure:
            logger.error("Invalid textData JSON.")
            raise
        effective = self.access_credential.copy()
        if document.url is not None:
            effective.url = document.url
        if document.access_token is not None:
            effective.secuaigent_access_token = document.access_token
        if document.deploy_name is not None:
            effective.model_name = document.deploy_name
        if document.tenant_id is not None:
            effective.tenant_id = document.tenant_id
        if document.stream_file_path is not None:
            effective.secuaigent_stream_file_path = document.stream_file_path
        if document.message_id is not None:
            effective.secuaigent_message_id = document.message_id
        if document.additional_prompt is not None:
            effective.secuaigent_additional_prompt = document.additional_prompt
        if document.create_library is not None:
            effective.secuaigent_create_library = document.create_library
        if (
            effective.secuaigent_stream_file_path is None
            and self.text_data_json_file_path is not None
            and self.text_data_json_file_path.strip()
        ):
            effective.secuaigent_stream_file_path = self.text_data_json_file_path
        self.effective_properties = effective
        logger.info("beforeExecute: textData applied for SecuAiGent retrieval")

    def _is_secuaigent_text_data_enabled(self) -> bool:
        """SecuAiGent で textData のパスが指定されているかを返す。

        Returns
        -------
        bool
            そうなら True。
        """
        return (
            self.access_credential.vendor_name == SECUAIGENT
            and self.text_data_json_file_path is not None
            and bool(self.text_data_json_file_path.strip())
        )

    def _current_properties(self) -> RetrievalProviderProperties:
        """実際に使う埋め込みプロバイダのプロパティ（textData 反映後があればそちら）を返す。

        Returns
        -------
        RetrievalProviderProperties
            プロパティ。
        """
        return (
            self.access_credential
            if self.effective_properties is None
            else self.effective_properties
        )
