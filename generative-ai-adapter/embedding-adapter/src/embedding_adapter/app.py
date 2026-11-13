"""埋め込みアダプタ本体（移植元 App。Waha! のアダプタ API を実装するクラス）。

Waha! の呼び方（`set_property` → `connect` → `set_column_information` →
`set_view_name` → `before_execute` → `write` → `after_execute`）のまま使う。

出力モード（`connect` の引数。properties.xml の outMode）:

| 値 | 意味 |
|---|---|
| 0 | テキスト出力（TSV だけ書く。ベクトルDB には書かない） |
| 1 | VDB追加登録 |
| 2 | VDB削除（ID 列のファイル ID を削除する） |
| 3 | VDB新規登録（新規作成として登録する） |

Waha! 固有の部分の置き換え:

- `ColumnData[]` は `embedding_adapter.waha.ColumnData` のリスト（バイト列の解析は不要）
- 出力先は `OUTPUT_DIR`（プロパティ 11）の下の `ビュー名` ファイル
- `Logger`（CoreLoggerConfig）は標準の `logging`
"""

import dataclasses
import logging
import re
from datetime import UTC, datetime
from pathlib import Path

from generative_ai_core.media import CoreMediaPreprocessingMode
from generative_ai_core.provider.clients.secuaigent.text_data import (
    CoreSecuAiGentTextDataDocument,
    CoreSecuAiGentTextDataLoader,
)
from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)

from embedding_adapter.audit import (
    GraphCandidateRepairMetricsSession,
    RejectAuditPathValidator,
    RejectAuditTsvSession,
)
from embedding_adapter.constants import (
    EMBEDDING_VENDOR_MAP,
    OUTPUT_TYPE_TEXT,
    OUTPUT_TYPE_VDB_ADD,
    OUTPUT_TYPE_VDB_DELETE,
    OUTPUT_TYPE_VDB_NEW,
    VDB_VENDOR_MAP,
    PropertyIds,
)
from embedding_adapter.controller.embedding_controller import EmbeddingController
from embedding_adapter.domain import (
    EmbeddingNetworkProperties,
    EmbeddingProviderProperties,
    GraphCandidateLlmConfig,
    VectorDBConfig,
)
from embedding_adapter.output import (
    JobOutcomeMarkerWriter,
    JobOutputRunContext,
    Outcome,
)
from embedding_adapter.waha import ColumnData, ColumnInformation, ColumnType

logger = logging.getLogger(__name__)

SECUAIGENT = "SecuAiGent"
MAX_PORT = 65535
MIN_TIMEOUT_SECONDS = 60
MAX_TIMEOUT_SECONDS = 86400
OUTPUT_DIR_PATTERN = re.compile(r"^[a-zA-Z]:\\.*$")
URL_PATTERN = re.compile(r"^(http|https)://.*$")
ALNUM_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")
VIEW_NAME_PLACEHOLDER = "インポート後に出力するファイル名に置き換えてください。"
GRAPH_VALIDATION_TABLE = "validation_table"
# 列の並び（移植元 getColumnInformation）
COLUMN_ID = ColumnInformation("ID", ColumnType.CHAR)
COLUMN_INPUT_FILE = ColumnInformation("入力ファイル", ColumnType.FILE)
COLUMN_SPLIT_LENGTH = ColumnInformation("分割文字数", ColumnType.DECIMAL_NUMBER)


def _image_mode_from_string(value: str) -> CoreMediaPreprocessingMode:
    """プロパティ 32 の値（0〜2）から画像説明のモードを求める。

    Parameters
    ----------
    value : str
        モードの数値を表す文字列。空なら DISABLED。未知の数値も DISABLED。

    Returns
    -------
    CoreMediaPreprocessingMode
        対応するモード。

    Raises
    ------
    ValueError
        数字でない文字列のとき（移植元は NumberFormatException）。
    """
    if not value:
        return CoreMediaPreprocessingMode.DISABLED
    by_code = {
        0: CoreMediaPreprocessingMode.DISABLED,
        1: CoreMediaPreprocessingMode.EMBED_ONLY,
        2: CoreMediaPreprocessingMode.FULL_PAGE,
    }
    return by_code.get(int(value), CoreMediaPreprocessingMode.DISABLED)


class App:
    """Waha! の埋め込みアダプタ（学習・同期・削除のうち、取り込みと削除を担う）。"""

    def __init__(self) -> None:
        """設定の入れ物を空で作る。"""
        self.output_dir: str | None = None
        self.reject_audit_output_dir: str | None = None
        self.output_type: int | None = None
        self.access_credential = EmbeddingProviderProperties()
        self.effective_embedding_provider_properties: (
            EmbeddingProviderProperties | None
        ) = None
        self.text_data_json_file_path: str | None = None
        self.graph_candidate_llm_config = GraphCandidateLlmConfig()
        self.proxy_setting = EmbeddingNetworkProperties()
        self.vector_db_config = VectorDBConfig()
        self.embedding_controller: EmbeddingController | None = None
        self.reject_audit_session = RejectAuditTsvSession.disabled()
        self.job_output_run_context = JobOutputRunContext.disabled()
        self.image_explanation_mode = CoreMediaPreprocessingMode.DISABLED
        self.column_information: list[ColumnInformation] = []
        self.view_name: str | None = None

    # ---- 保存時チェック ----

    def validate_column_information(self, column: ColumnInformation) -> bool:
        """列の設定値の保存用チェック（移植元は何も検査しない）。

        Parameters
        ----------
        column : ColumnInformation
            列の情報。

        Returns
        -------
        bool
            常に True。
        """
        return True

    def validate_property(self, prop_id: int, value: str | None) -> bool:
        """接続プロパティの保存用チェック。不正なら例外にする。

        Parameters
        ----------
        prop_id : int
            プロパティの ID。
        value : str | None
            プロパティの値。

        Returns
        -------
        bool
            常に True（不正な値は例外）。

        Raises
        ------
        RuntimeError
            値が不正なとき。
        """
        v = value or ""
        if prop_id == PropertyIds.URL:
            if not URL_PATTERN.match(v):
                raise RuntimeError(
                    f"エンベディング URLに不正な値が入力されています。URLを入力してください。{v}"
                )
        elif prop_id == PropertyIds.API_KEY:
            if v == "" or any(ch.isspace() for ch in v):
                raise RuntimeError(
                    "エンベディング API Keyに不正な値が入力されています。"
                    "空白を含まない値を入力してください。"
                )
        elif prop_id == PropertyIds.OUTPUT_DIR:
            if v != "" and not OUTPUT_DIR_PATTERN.match(v):
                raise RuntimeError(
                    "出力先ディレクトリに不正な値が入力されています。"
                    f"有効なディレクトリパスを入力してください。{v}"
                )
        elif prop_id == PropertyIds.PROXY_PORT:
            self._validate_proxy_port(v)
        elif prop_id in (PropertyIds.PROXY_ID, PropertyIds.PROXY_PASS):
            if v != "" and (not ALNUM_PATTERN.match(v) or " " in v):
                label = (
                    "Proxy認証ユーザID"
                    if prop_id == PropertyIds.PROXY_ID
                    else ("Proxy認証パスワード")
                )
                raise RuntimeError(
                    f"{label}に不正な値が入力されています。英数字で入力してください。{v}"
                )
        elif prop_id == PropertyIds.TIMEOUT_SECONDS:
            timeout_seconds = int(v)
            if timeout_seconds < MIN_TIMEOUT_SECONDS or (
                timeout_seconds > MAX_TIMEOUT_SECONDS
            ):
                raise RuntimeError(
                    "タイムアウトの値は60〜86400秒の範囲で指定してください（1分〜1日）"
                )
        elif prop_id == PropertyIds.AGE_GRAPH_NAME:
            if v.strip():
                CoreDerivedResourceNameResolver().resolve(
                    GRAPH_VALIDATION_TABLE, CoreDerivedResourceTargetKind.AGE_GRAPH, v
                )
        elif prop_id == PropertyIds.GRAPH_CANDIDATE_LLM_VENDOR:
            GraphCandidateLlmConfig.validate_provider(v)
        elif prop_id == PropertyIds.EMBEDDING_DIMENSIONS:
            self._validate_embedding_dimensions(v)
        elif prop_id == PropertyIds.REJECT_AUDIT_OUTPUT_DIR and v != "":
            RejectAuditPathValidator.validate_configured_path_string(v)
        return True

    @staticmethod
    def _validate_proxy_port(value: str) -> None:
        """Proxy ポート番号の保存用チェック。

        Parameters
        ----------
        value : str
            ポート番号の文字列（空は許す）。

        Raises
        ------
        RuntimeError
            数値でない・範囲外のとき。
        """
        if value == "":
            return
        range_message = f"Proxyポート番号に不正な値が入力されています。0~65535の間で指定してください。{value}"
        try:
            port = int(value)
        except ValueError as e:
            raise RuntimeError(
                "Proxyポート番号に不正な値が入力されています。"
                f"数値を整数で入力してください。{value}"
            ) from e
        if port < 0 or port > MAX_PORT:
            raise RuntimeError(range_message)

    @staticmethod
    def _validate_embedding_dimensions(value: str) -> None:
        """Embedding dimensions の保存用チェック。

        Parameters
        ----------
        value : str
            次元数の文字列（空は許す）。

        Raises
        ------
        RuntimeError
            正の整数でないとき。
        """
        if value == "":
            return
        message = "Embedding dimensions に不正な値が入力されています。正の整数を入力してください。"
        try:
            if int(value) <= 0:
                raise RuntimeError(message)
        except ValueError as e:
            raise RuntimeError(message) from e

    # ---- プロパティ ----

    def set_property(self, prop_id: int, prop_value: str) -> None:
        """接続プロパティを受け取る。

        Parameters
        ----------
        prop_id : int
            プロパティの ID。
        prop_value : str
            プロパティの値。

        Raises
        ------
        ValueError
            ベンダー ID が未対応・数値でない値のとき。
        """
        credential = self.access_credential
        proxy = self.proxy_setting
        vdb = self.vector_db_config
        graph_llm = self.graph_candidate_llm_config
        if prop_id == PropertyIds.URL:
            credential.url = prop_value
        elif prop_id == PropertyIds.API_KEY:
            credential.api_key = prop_value
        elif prop_id == PropertyIds.MODEL_NAME:
            credential.model_name = prop_value
        elif prop_id == PropertyIds.TENANT_ID:
            credential.tenant_id = prop_value
            graph_llm.tenant_id = prop_value
        elif prop_id == PropertyIds.USE_PROXY:
            proxy.use_proxy = int(prop_value)
        elif prop_id == PropertyIds.PROXY_HOST:
            proxy.proxy_host = prop_value
        elif prop_id == PropertyIds.PROXY_PORT:
            proxy.proxy_port = int(prop_value) if prop_value != "" else -1
        elif prop_id == PropertyIds.USE_PROXY_CRED:
            proxy.use_proxy_cred = prop_value == "1"
        elif prop_id == PropertyIds.PROXY_ID:
            proxy.proxy_id = prop_value
        elif prop_id == PropertyIds.PROXY_PASS:
            proxy.proxy_pass = prop_value
        elif prop_id == PropertyIds.INSECURE_SSL:
            proxy.insecure_ssl_enabled = prop_value == "1"
        elif prop_id == PropertyIds.OUTPUT_DIR:
            self.output_dir = prop_value
        elif prop_id == PropertyIds.VDB_URL:
            vdb.url = prop_value
        elif prop_id == PropertyIds.VDB_API_KEY:
            vdb.api_key = prop_value
        elif prop_id == PropertyIds.VDB_INDEX_NAME:
            vdb.index_name = prop_value
        elif prop_id == PropertyIds.TIMEOUT_SECONDS:
            timeout_seconds = int(prop_value)
            credential.timeout_seconds = timeout_seconds
            graph_llm.timeout_seconds = timeout_seconds
        elif prop_id == PropertyIds.VENDOR:
            vendor_name = EMBEDDING_VENDOR_MAP.get(prop_value)
            if vendor_name is None:
                raise ValueError(f"Unsupported vendor ID: {prop_value}")
            credential.vendor_name = vendor_name
        elif prop_id == PropertyIds.VDB_VENDOR:
            vdb_vendor_name = VDB_VENDOR_MAP.get(prop_value)
            if vdb_vendor_name is None:
                raise ValueError(f"Unsupported vendor ID: {prop_value}")
            vdb.vendor_name = vdb_vendor_name
        elif prop_id == PropertyIds.IMAGE_EXPLANATION_MODE:
            self.image_explanation_mode = _image_mode_from_string(prop_value)
        elif prop_id == PropertyIds.VDB_USER_NAME:
            vdb.user_name = prop_value
        elif prop_id == PropertyIds.VDB_PASSWORD:
            vdb.password = prop_value
        elif prop_id == PropertyIds.VDB_DATABASE_NAME:
            vdb.database_name = prop_value
        elif prop_id == PropertyIds.VDB_TABLE_NAME:
            vdb.table_name = prop_value
        elif prop_id == PropertyIds.GRAPH_WRITE_ENABLED:
            vdb.graph_write_enabled = prop_value == "1"
        elif prop_id == PropertyIds.AGE_GRAPH_NAME:
            vdb.graph_name = prop_value
        elif prop_id == PropertyIds.GRAPH_CANDIDATE_LLM_VENDOR:
            graph_llm.vendor_name = prop_value
        elif prop_id == PropertyIds.GRAPH_CANDIDATE_LLM_URL:
            graph_llm.url = prop_value
        elif prop_id == PropertyIds.GRAPH_CANDIDATE_LLM_API_KEY:
            graph_llm.api_key = prop_value
        elif prop_id == PropertyIds.GRAPH_CANDIDATE_LLM_MODEL_NAME:
            graph_llm.model_name = prop_value
        elif prop_id == PropertyIds.EMBEDDING_DIMENSIONS:
            credential.embedding_dimensions = (
                None
                if prop_value is None or prop_value.strip() == ""
                else int(prop_value)
            )
        elif prop_id == PropertyIds.TEXT_DATA_JSON_FILE_PATH:
            self.text_data_json_file_path = prop_value
        elif prop_id == PropertyIds.REJECT_AUDIT_OUTPUT_DIR:
            self.reject_audit_output_dir = prop_value

    def set_temp_directory(self, temp_dir: str) -> None:
        """Waha! の一時ディレクトリを受け取る（移植元は使わない）。

        Parameters
        ----------
        temp_dir : str
            一時ディレクトリのパス。
        """

    # ---- 接続・ビュー ----

    def _current_embedding_provider_properties(self) -> EmbeddingProviderProperties:
        """textData で上書きした後の埋め込み設定（なければ元の設定）を返す。

        Returns
        -------
        EmbeddingProviderProperties
            実際に使う設定。
        """
        if self.effective_embedding_provider_properties is None:
            return self.access_credential
        return self.effective_embedding_provider_properties

    def init_embedding_controller(self) -> EmbeddingController:
        """EmbeddingController を作る。

        Returns
        -------
        EmbeddingController
            作ったコントローラー。

        Raises
        ------
        RuntimeError
            Graph 書き込み・SecuAiGent の必須設定が足りないとき。
        """
        if self.effective_embedding_provider_properties is None:
            self._prepare_text_data_overlay()
        if self.output_type is not None:
            self.vector_db_config.is_new_creation = (
                self.output_type == OUTPUT_TYPE_VDB_NEW
            )
        self._validate_graph_write_runtime_properties()
        self._validate_secuaigent_runtime_properties()
        graph_candidate_properties = (
            self.graph_candidate_llm_config.to_embedding_provider_properties_required()
            if self.vector_db_config.graph_write_enabled
            else None
        )
        return EmbeddingController(
            "",
            self.proxy_setting,
            self._current_embedding_provider_properties(),
            self.vector_db_config,
            self.image_explanation_mode,
            graph_candidate_properties,
            self.reject_audit_output_dir,
        )

    def _validate_graph_write_runtime_properties(self) -> None:
        """Graph 書き込みが有効なときの実行時チェック。

        Raises
        ------
        RuntimeError
            PostgreSQL(PGVector) 以外・Graph candidate LLM の設定が足りないとき。
        """
        if not self.vector_db_config.graph_write_enabled:
            return
        if not self.vector_db_config.is_postgre_sql_provider():
            raise RuntimeError(
                "Graph write is available only for PostgreSQL(PGVector)."
            )
        self.vector_db_config.get_effective_graph_name()
        self.vector_db_config.get_effective_index_name()
        self.graph_candidate_llm_config.validate_required()

    def _validate_secuaigent_runtime_properties(self) -> None:
        """SecuAiGent を使うときの実行時チェック。

        Raises
        ------
        RuntimeError
            Tenant ID・URL・API Key・モデルが足りないとき。
        """
        credential = self._current_embedding_provider_properties()
        embedding_secuaigent = credential.vendor_name == SECUAIGENT
        candidate_secuaigent = self.graph_candidate_llm_config.vendor_name == SECUAIGENT
        if not embedding_secuaigent and not candidate_secuaigent:
            return
        if not (credential.tenant_id or "").strip():
            raise RuntimeError("Tenant ID が必要です。")
        if embedding_secuaigent:
            if not (credential.url or "").strip():
                raise RuntimeError("エンベディング URL が必要です。")
            if not (credential.api_key or "").strip():
                raise RuntimeError("エンベディング API Key が必要です。")
            if not (credential.model_name or "").strip():
                raise RuntimeError("エンベディング モデル設定が必要です。")

    def test_connect(self) -> bool:
        """接続テスト。

        Returns
        -------
        bool
            成功すれば True。

        Raises
        ------
        RuntimeError
            Proxy 設定が不足・接続の準備に失敗したとき。
        """
        if self.proxy_setting.use_proxy == 1:
            if (self.proxy_setting.proxy_host or "") == "":
                raise RuntimeError("Proxy設定が手動の場合はProxyホスト名が必要です。")
            if self.proxy_setting.proxy_port == -1:
                raise RuntimeError("Proxy設定が手動の場合はProxyポート番号が必要です。")
        try:
            self.embedding_controller = self.init_embedding_controller()
            self.embedding_controller.test_connect()
        except Exception as e:
            raise RuntimeError(f"接続に失敗しました。{e}") from e
        return True

    def get_view_names(self) -> list[str]:
        """ビュー名の一覧（移植元と同じ案内の文言 1 件）。

        Returns
        -------
        list[str]
            ビュー名の一覧。
        """
        return [VIEW_NAME_PLACEHOLDER]

    def get_column_information(self, view_name: str) -> list[ColumnInformation]:
        """ビューの列の定義を返す。

        Parameters
        ----------
        view_name : str
            ビュー名（使わない）。

        Returns
        -------
        list[ColumnInformation]
            ID・入力ファイル・分割文字数の 3 列。
        """
        return [COLUMN_ID, COLUMN_INPUT_FILE, COLUMN_SPLIT_LENGTH]

    def connect(self, out_mode: int) -> None:
        """接続する（出力モードを受け取るだけ）。

        Parameters
        ----------
        out_mode : int
            出力モード（0=テキスト出力、1=VDB追加登録、2=VDB削除、3=VDB新規登録）。
        """
        self.output_type = out_mode

    def disconnect(self) -> None:
        """切断する（何もしない）。"""

    def set_column_information(self, columns: list[ColumnInformation]) -> None:
        """ビューの列の情報を受け取る。

        Parameters
        ----------
        columns : list[ColumnInformation]
            列の情報。
        """
        self.column_information = list(columns)

    def set_view_name(self, view_name: str) -> None:
        """出力ファイル名（ビュー名）を受け取る。

        Parameters
        ----------
        view_name : str
            ビュー名。
        """
        self.view_name = view_name

    # ---- 実行 ----

    def write(self, record: list[ColumnData]) -> None:
        """1 レコードを処理する（削除、または分割・登録・TSV 出力）。

        Parameters
        ----------
        record : list[ColumnData]
            列の値（`set_column_information` と同じ並び）。

        Raises
        ------
        RuntimeError
            コントローラーが未作成（`before_execute` 前）・埋め込みに失敗したとき。
        """
        split_length = 0
        input_file_path = ""
        id_value: str | None = None
        for info, data in zip(self.column_information, record, strict=False):
            if info.col_type == ColumnType.FILE:
                input_file_path = (data.b_ary or b"").decode("utf-8")
            elif info.col_type == ColumnType.DECIMAL_NUMBER:
                split_length = int(data.s or "0")
            elif info.col_type == ColumnType.CHAR:
                id_value = data.s
        controller = self.embedding_controller
        if controller is None:
            raise RuntimeError("before_execute が呼ばれていません。")
        # 出力モード 2 はベクトルDB から削除、それ以外は分割して出力する
        if self.output_type == OUTPUT_TYPE_VDB_DELETE:
            controller.delete_embedding(id_value)
        else:
            controller.execute_embedding(
                split_length,
                input_file_path,
                f"{self.output_dir}/{self.view_name}",
                self.output_type if self.output_type is not None else OUTPUT_TYPE_TEXT,
                id_value,
            )

    def before_execute(self) -> None:
        """実行前の準備（textData・監査セッション・コントローラー・出力ファイルの削除）。"""
        self._prepare_text_data_overlay()
        self.reject_audit_session = self._open_reject_audit_session()
        self.job_output_run_context = self._create_job_output_run_context()
        if self.embedding_controller is None:
            self.embedding_controller = self.init_embedding_controller()
        self.embedding_controller.wire_reject_audit_session(self.reject_audit_session)
        self.embedding_controller.wire_job_output_context(self.job_output_run_context)
        # 出力ファイルは追記されるため、書き込み前に既存のものを消す
        if self.output_type in (
            OUTPUT_TYPE_TEXT,
            OUTPUT_TYPE_VDB_ADD,
            OUTPUT_TYPE_VDB_NEW,
        ):
            Path(f"{self.output_dir}/{self.view_name}").unlink(missing_ok=True)

    def after_execute(self) -> None:
        """実行後の処理（Graph Candidate のジョブ結果マーカーとメトリクス）。

        Raises
        ------
        RuntimeError
            Graph Candidate のジョブが ERROR で終わったとき。
        """
        context = self.job_output_run_context
        if not context.is_enabled():
            return
        outcome = context.compute_outcome()
        if self.output_dir is not None and self.output_dir.strip() != "":
            JobOutcomeMarkerWriter().write(Path(self.output_dir), outcome)
        GraphCandidateRepairMetricsSession.open(self.reject_audit_session).flush()
        if outcome == Outcome.ERROR:
            raise RuntimeError("Graph Candidate job failed with ERROR outcome.")

    def _open_reject_audit_session(self) -> RejectAuditTsvSession:
        """拒否監査の TSV セッションを開く（設定がない・失敗したときは無効）。

        Returns
        -------
        RejectAuditTsvSession
            監査セッション。
        """
        if (
            self.reject_audit_output_dir is None
            or not self.reject_audit_output_dir.strip()
        ):
            return RejectAuditTsvSession.disabled()
        try:
            config = RejectAuditPathValidator.from_configured_path(
                self.reject_audit_output_dir
            )
            return RejectAuditTsvSession.open(config, datetime.now(UTC))
        except RuntimeError:
            return RejectAuditTsvSession.disabled()

    def _create_job_output_run_context(self) -> JobOutputRunContext:
        """Graph Candidate のジョブ結果を集計するコンテキストを作る。

        Returns
        -------
        JobOutputRunContext
            追加・新規登録で Graph 書き込みが有効なら有効なコンテキスト。
        """
        if (
            self.output_type not in (OUTPUT_TYPE_VDB_ADD, OUTPUT_TYPE_VDB_NEW)
            or not self.vector_db_config.graph_write_enabled
        ):
            return JobOutputRunContext.disabled()
        try:
            self.graph_candidate_llm_config.validate_required()
            return JobOutputRunContext.enabled()
        except RuntimeError:
            return JobOutputRunContext.disabled()

    # ---- SecuAiGent textData ----

    def _is_secuaigent_text_data_enabled(self) -> bool:
        """SecuAiGent の textData を使うか。

        Returns
        -------
        bool
            ベンダーが SecuAiGent で textData のパスが指定されていれば True。
        """
        return (
            self.access_credential.vendor_name == SECUAIGENT
            and self.text_data_json_file_path is not None
            and self.text_data_json_file_path.strip() != ""
        )

    def _prepare_text_data_overlay(self) -> None:
        """textData の値で埋め込み設定を上書きした写しを作る。

        Raises
        ------
        ValueError
            textData が不正なとき（`CoreSecuAiGentTextDataFailure`）。
        """
        self.effective_embedding_provider_properties = self.access_credential
        if not self._is_secuaigent_text_data_enabled():
            return
        try:
            document = CoreSecuAiGentTextDataLoader().load(
                self.text_data_json_file_path
            )
        except ValueError:
            logger.error("Invalid textData JSON.")
            raise
        effective = _apply_overlay(self.access_credential, document)
        if (
            effective.secu_ai_gent_stream_file_path is None
            and self.text_data_json_file_path
        ):
            effective.secu_ai_gent_stream_file_path = self.text_data_json_file_path
        self.effective_embedding_provider_properties = effective


def _apply_overlay(
    base: EmbeddingProviderProperties, document: CoreSecuAiGentTextDataDocument
) -> EmbeddingProviderProperties:
    """textData の値で埋め込み設定を上書きした写しを作る（元は変えない）。

    Parameters
    ----------
    base : EmbeddingProviderProperties
        プロパティから作った設定。
    document : CoreSecuAiGentTextDataDocument
        読み込んだ textData。

    Returns
    -------
    EmbeddingProviderProperties
        上書きした写し。
    """
    copy = dataclasses.replace(base)
    overlay: list[tuple[str, object | None]] = [
        ("url", document.url),
        ("secu_ai_gent_access_token", document.access_token),
        ("model_name", document.deploy_name),
        ("tenant_id", document.tenant_id),
        ("secu_ai_gent_stream_file_path", document.stream_file_path),
        ("secu_ai_gent_message_id", document.message_id),
        ("secu_ai_gent_additional_prompt", document.additional_prompt),
        ("secu_ai_gent_create_library", document.create_library),
    ]
    for name, value in overlay:
        if value is not None:
            setattr(copy, name, value)
    return copy
