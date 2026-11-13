"""アダプタの設定・入出力の型（移植元 embedding.domain）。

Waha! のプロパティを 1 つずつ受け取る可変クラス（`EmbeddingProviderProperties` など）は、
Java の getter/setter を属性にしている（`setUrl` → `url`）。
"""

import json
import re
from dataclasses import dataclass, field
from enum import Enum

from generative_ai_core.network import (
    DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
    MIN_TIMEOUT_SECONDS,
    CoreNetworkSetting,
    CoreProxySetting,
)
from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)

DEFAULT_TIMEOUT = 180
SEARCH_ACTION_UPLOAD = "upload"
SEARCH_ACTION_KEY = "@search.action"

PROXY_MODE_NONE = 0
PROXY_MODE_SYSTEM = 2

DEFAULT_GRAPH_NAME = "secuaigent_core_graph"
_PROVIDER_AZURE_AI_SEARCH = "Azure AI Search"
_PROVIDER_POSTGRESQL_PGVECTOR = "PostgreSQL(PGVector)"
_PROVIDER_LEGACY_AZURE_OPENAI = "AzureOpenAI"
_PROVIDER_LEGACY_POSTGRESQL = "PostgreSQL"
_PROVIDER_LEGACY_PGVECTOR = "PGvector"

_GRAPH_CANDIDATE_PROVIDERS = frozenset({"OpenAI", "AzureOpenAI", "SecuAiGent"})
_GRAPH_PROVIDER_MESSAGE = "Graph candidate LLM credential requires provider OpenAI, AzureOpenAI, or SecuAiGent."

_JDBC_URL = re.compile(r"jdbc:postgresql://[^\s'\"]+", re.IGNORECASE)
_HTTP_URL = re.compile(r"https?://[^\s'\"]+", re.IGNORECASE)
_KEY_VALUE_SECRET = re.compile(
    r"(?i)(password|passwd|pwd|api[_-]?key|token|proxy(?:Pass|Password)?|user)"
    r"\s*[:=]\s*[^\s,;]+"
)


def _has_text(value: str | None) -> bool:
    """空白以外の文字を含むか。

    Parameters
    ----------
    value : str | None
        判定する文字列。

    Returns
    -------
    bool
        空白以外の文字があれば True。
    """
    return value is not None and value.strip() != ""


def _sanitize_graph_write_message(message: str | None) -> str:
    """グラフ書き込みの失敗メッセージから資格情報らしい値を伏せる。

    移植元 `GraphWriteErrorSanitizer.sanitize(String)` と同じ置換。循環 import を
    避けるため domain に持つ。

    Parameters
    ----------
    message : str | None
        失敗メッセージ。

    Returns
    -------
    str
        伏せ字にしたメッセージ。None は空文字列。
    """
    if message is None:
        return ""
    sanitized = _JDBC_URL.sub("<redacted-jdbc-url>", message)
    sanitized = _HTTP_URL.sub("<redacted-url>", sanitized)
    return _KEY_VALUE_SECRET.sub(r"\1=<redacted>", sanitized)


@dataclass
class Embedding:
    """ベクトルストアに保存する 1 件の埋め込み（移植元 Embedding）。

    Attributes
    ----------
    id : str | None
        行の ID。
    content : str | None
        本文。
    vector : list[float] | None
        埋め込みベクトル。
    file_unique_id : str | None
        ファイル固有 ID。
    source_file_path : str | None
        取り込み元ファイルのパス。
    """

    id: str | None = None
    content: str | None = None
    vector: list[float] | None = None
    file_unique_id: str | None = None
    source_file_path: str | None = None


@dataclass
class AzureEmbedding:
    """Azure AI Search に送る 1 件の文書（移植元 AzureEmbedding）。

    Attributes
    ----------
    id : str | None
        文書の ID。
    content_vector : list[float] | None
        埋め込みベクトル。
    search_action : str
        `@search.action` の値。既定は upload。
    """

    id: str | None
    content_vector: list[float] | None
    search_action: str = SEARCH_ACTION_UPLOAD

    def to_json(self) -> str:
        """`{"value":[文書]}` の JSON にする。

        Returns
        -------
        str
            JSON 文字列。null の項目は出さない（Gson と同じ）。
        """
        document: dict[str, object] = {}
        if self.id is not None:
            document["id"] = self.id
        if self.content_vector is not None:
            document["contentVector"] = self.content_vector
        if self.search_action is not None:
            document[SEARCH_ACTION_KEY] = self.search_action
        return json.dumps(
            {"value": [document]}, ensure_ascii=False, separators=(",", ":")
        )


@dataclass
class RequestSchema:
    """埋め込み API のリクエスト（移植元 RequestSchema）。

    Attributes
    ----------
    model : str | None
        モデル名。
    input : str | None
        入力文字列。
    dimensions : int | None
        次元数。
    """

    model: str | None = None
    input: str | None = None
    dimensions: int | None = None


@dataclass
class EmbeddingProviderProperties:
    """埋め込みプロバイダの Waha! プロパティ（可変。移植元 EmbeddingProviderProperties）。

    境界で core の不変な設定へ変換する。

    Attributes
    ----------
    url : str | None
        エンドポイント。
    test_url : str | None
        テスト接続の URL。
    api_key : str | None
        API キー。
    model_name : str | None
        モデル名。
    vendor_name : str | None
        ベンダー名。
    secu_ai_gent_access_token : str | None
        SecuAiGent のアクセストークン。
    tenant_id : str | None
        テナント ID。
    secu_ai_gent_stream_file_path : str | None
        SecuAiGent のストリームファイルのパス。
    embedding_dimensions : int | None
        埋め込みの次元数。
    timeout_seconds : int
        タイムアウト秒。
    secu_ai_gent_message_id : str | None
        SecuAiGent のメッセージ ID。
    secu_ai_gent_additional_prompt : str | None
        SecuAiGent の追加プロンプト。
    secu_ai_gent_create_library : bool | None
        SecuAiGent のライブラリ作成フラグ。
    """

    url: str | None = None
    test_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None
    vendor_name: str | None = None
    secu_ai_gent_access_token: str | None = None
    tenant_id: str | None = None
    secu_ai_gent_stream_file_path: str | None = None
    embedding_dimensions: int | None = None
    timeout_seconds: int = DEFAULT_TIMEOUT
    secu_ai_gent_message_id: str | None = None
    secu_ai_gent_additional_prompt: str | None = None
    secu_ai_gent_create_library: bool | None = None


@dataclass
class EmbeddingNetworkProperties:
    """プロキシ・SSL の Waha! プロパティ（可変。移植元 EmbeddingNetworkProperties）。

    Attributes
    ----------
    use_proxy : int
        0 なし、2 システム、それ以外は手動。
    proxy_host : str | None
        プロキシのホスト。
    proxy_port : int
        プロキシのポート。
    use_proxy_cred : bool
        プロキシの認証を使うか。
    proxy_id : str | None
        プロキシの認証ユーザー ID。
    proxy_pass : str | None
        プロキシの認証パスワード。
    insecure_ssl_enabled : bool
        SSL 検証を無効にするか。
    """

    use_proxy: int = 0
    proxy_host: str | None = None
    proxy_port: int = 0
    use_proxy_cred: bool = False
    proxy_id: str | None = None
    proxy_pass: str | None = None
    insecure_ssl_enabled: bool = False

    def to_setting(self, timeout_seconds: int | None) -> CoreNetworkSetting:
        """core のネットワーク設定にする。

        Parameters
        ----------
        timeout_seconds : int | None
            タイムアウト秒。範囲外・未指定は既定値にする。

        Returns
        -------
        CoreNetworkSetting
            core のネットワーク設定。
        """
        if self.use_proxy == PROXY_MODE_NONE:
            proxy = CoreProxySetting.none()
        elif self.use_proxy == PROXY_MODE_SYSTEM:
            proxy = CoreProxySetting.system()
        elif self.use_proxy_cred:
            proxy = CoreProxySetting.manual(
                self.proxy_host or "",
                self.proxy_port,
                self.proxy_id or "",
                self.proxy_pass or "",
            )
        else:
            proxy = CoreProxySetting.manual(self.proxy_host or "", self.proxy_port)
        timeout = (
            DEFAULT_TIMEOUT_SECONDS
            if timeout_seconds is None
            or timeout_seconds < MIN_TIMEOUT_SECONDS
            or timeout_seconds > MAX_TIMEOUT_SECONDS
            else timeout_seconds
        )
        return CoreNetworkSetting.from_seconds(
            proxy, self.insecure_ssl_enabled, timeout
        )


def normalize_vendor_name(value: str | None) -> str | None:
    """Graph Candidate LLM のベンダー名を正規化する。

    Parameters
    ----------
    value : str | None
        ベンダー名または ID（0・1・5）。

    Returns
    -------
    str | None
        正規化したベンダー名。空・None はそのまま返す。
    """
    if value is None or value.strip() == "":
        return value
    trimmed = value.strip()
    if trimmed in ("0", "OpenAI"):
        return "OpenAI"
    if trimmed in ("1", "AzureOpenAI"):
        return "AzureOpenAI"
    if trimmed in ("5", "SecuAiGent"):
        return "SecuAiGent"
    return trimmed


class GraphCandidateLlmConfig:
    """Graph Candidate の抽出に使う LLM の設定（移植元 GraphCandidateLlmConfig）。

    `vendor_name` は代入時に正規化する（Java の setVendorName と同じ）。
    """

    def __init__(self) -> None:
        """未設定の状態で作る。"""
        self._vendor_name: str | None = None
        self.url: str | None = None
        self.api_key: str | None = None
        self.model_name: str | None = None
        self.tenant_id: str | None = None
        self.timeout_seconds: int = 0

    @property
    def vendor_name(self) -> str | None:
        """ベンダー名。

        Returns
        -------
        str | None
            正規化したベンダー名。
        """
        return self._vendor_name

    @vendor_name.setter
    def vendor_name(self, value: str | None) -> None:
        """ベンダー名を正規化して設定する。

        Parameters
        ----------
        value : str | None
            ベンダー名または ID。
        """
        self._vendor_name = normalize_vendor_name(value)

    def to_embedding_provider_properties_required(self) -> EmbeddingProviderProperties:
        """検証したうえでプロバイダのプロパティにする。

        Returns
        -------
        EmbeddingProviderProperties
            Graph Candidate 用のプロバイダ設定。

        Raises
        ------
        RuntimeError
            必須項目が足りない・不正なとき。
        """
        self.validate_required()
        credential = EmbeddingProviderProperties(
            url=self.url,
            test_url="",
            api_key=self.api_key,
            model_name=self.model_name,
            vendor_name=self._vendor_name,
        )
        credential.timeout_seconds = self.timeout_seconds
        if self._vendor_name == "SecuAiGent":
            credential.tenant_id = self.tenant_id
        return credential

    def validate_required(self) -> None:
        """実行に必要な項目が揃っているか確かめる。

        Raises
        ------
        RuntimeError
            プロバイダ・URL・API キー・モデル名・Tenant ID（SecuAiGent）が不正なとき。
        """
        if (
            not _has_text(self._vendor_name)
            or self._vendor_name not in _GRAPH_CANDIDATE_PROVIDERS
        ):
            raise RuntimeError(_GRAPH_PROVIDER_MESSAGE)
        if (
            not _has_text(self.url)
            or not _has_text(self.api_key)
            or not _has_text(self.model_name)
        ):
            raise RuntimeError(
                "Graph candidate LLM credential requires URL, API key, and model name."
            )
        self._validate_azure_endpoint()
        if self._vendor_name == "SecuAiGent" and not _has_text(self.tenant_id):
            raise RuntimeError("Graph candidate LLM credential requires Tenant ID.")

    def _validate_azure_endpoint(self) -> None:
        """AzureOpenAI の URL がエンドポイントだけかを確かめる。

        Raises
        ------
        RuntimeError
            URL にデプロイ名や api-version が含まれるとき。
        """
        if self._vendor_name != "AzureOpenAI":
            return
        normalized = (self.url or "").lower()
        if "/openai/deployments/" in normalized or "api-version" in normalized:
            raise RuntimeError(
                "Graph candidate LLM AzureOpenAI endpoint must be endpoint/base URL "
                "only; deployment/model belongs to property 50."
            )

    @staticmethod
    def validate_provider(value: str | None) -> None:
        """プロパティ 47 の値が対応するプロバイダか確かめる（空は許す）。

        Parameters
        ----------
        value : str | None
            ベンダー名または ID。

        Raises
        ------
        RuntimeError
            対応しないプロバイダのとき。
        """
        normalized = normalize_vendor_name(value)
        if _has_text(normalized) and normalized not in _GRAPH_CANDIDATE_PROVIDERS:
            raise RuntimeError(_GRAPH_PROVIDER_MESSAGE)


@dataclass
class GraphChunkWriteRequest:
    """グラフへ 1 チャンクを書く要求（移植元 GraphChunkWriteRequest）。

    Attributes
    ----------
    file_id : str | None
        ファイル固有 ID。
    file_path : str | None
        ファイルのパス。
    vector_row_id : str | None
        ベクトル行の ID。
    chunk_sequence : int
        チャンクの連番。
    content : str | None
        チャンクの本文。
    previous_vector_row_id : str | None
        直前のチャンクのベクトル行 ID。
    """

    file_id: str | None = None
    file_path: str | None = None
    vector_row_id: str | None = None
    chunk_sequence: int = 0
    content: str | None = None
    previous_vector_row_id: str | None = None


class GraphWriteStatus(Enum):
    """グラフ書き込みの状態（移植元 GraphWriteStatus）。"""

    DISABLED = "DISABLED"
    SUCCESS = "SUCCESS"
    FAILED_CONFIGURATION = "FAILED_CONFIGURATION"
    FAILED_EXTENSION_UNAVAILABLE = "FAILED_EXTENSION_UNAVAILABLE"
    FAILED_WRITE = "FAILED_WRITE"


_FAILED_STATUSES = frozenset(
    {
        GraphWriteStatus.FAILED_CONFIGURATION,
        GraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
        GraphWriteStatus.FAILED_WRITE,
    }
)


@dataclass
class GraphWriteResult:
    """グラフ書き込みの結果（移植元 GraphWriteResult）。

    Attributes
    ----------
    status : GraphWriteStatus | None
        状態。
    file_id : str | None
        ファイル固有 ID。
    chunk_ids : list[str]
        書き込んだチャンクの ID。
    message : str | None
        メッセージ。
    cause_category : str | None
        原因の分類。
    """

    status: GraphWriteStatus | None = None
    file_id: str | None = None
    chunk_ids: list[str] = field(default_factory=list)
    message: str | None = None
    cause_category: str | None = None

    @classmethod
    def disabled(cls) -> "GraphWriteResult":
        """グラフ書き込みが無効なときの結果を作る。

        Returns
        -------
        GraphWriteResult
            DISABLED の結果。
        """
        return cls(
            GraphWriteStatus.DISABLED, None, [], "Graph write is disabled.", "DISABLED"
        )

    @classmethod
    def success(cls, file_id: str | None, chunk_ids: list[str]) -> "GraphWriteResult":
        """成功の結果を作る。

        Parameters
        ----------
        file_id : str | None
            ファイル固有 ID。
        chunk_ids : list[str]
            書き込んだチャンクの ID。

        Returns
        -------
        GraphWriteResult
            SUCCESS の結果。
        """
        return cls(
            GraphWriteStatus.SUCCESS,
            file_id,
            list(chunk_ids),
            "Graph write succeeded.",
            "NONE",
        )

    @classmethod
    def failure(
        cls,
        status: GraphWriteStatus,
        file_id: str | None,
        chunk_ids: list[str],
        message: str | None,
        cause_category: str | None,
    ) -> "GraphWriteResult":
        """失敗の結果を作る。メッセージは資格情報を伏せる。

        Parameters
        ----------
        status : GraphWriteStatus
            失敗の状態。
        file_id : str | None
            ファイル固有 ID。
        chunk_ids : list[str]
            チャンクの ID。
        message : str | None
            失敗メッセージ。
        cause_category : str | None
            原因の分類。

        Returns
        -------
        GraphWriteResult
            失敗の結果。
        """
        return cls(
            status,
            file_id,
            list(chunk_ids),
            _sanitize_graph_write_message(message),
            cause_category,
        )

    def is_failed(self) -> bool:
        """失敗の状態か。

        Returns
        -------
        bool
            設定・拡張・書き込みのいずれかの失敗なら True。
        """
        return self.status in _FAILED_STATUSES


@dataclass
class VectorDBConfig:
    """ベクトルDB の設定（移植元 VectorDBConfig）。

    Attributes
    ----------
    vendor_name : str | None
        ベンダー名（`Azure AI Search`・`PostgreSQL(PGVector)`）。
    url : str | None
        接続先。
    api_key : str | None
        API キー。
    index_name : str | None
        インデックス名。
    user_name : str | None
        DB のユーザー名。
    password : str | None
        DB のパスワード。
    database_name : str | None
        DB 名。
    table_name : str | None
        テーブル名。
    is_new_creation : bool
        新規作成か（出力モード 3）。
    graph_write_enabled : bool
        グラフ書き込みを有効にするか。
    graph_name : str | None
        グラフ名。
    """

    vendor_name: str | None = None
    url: str | None = None
    api_key: str | None = None
    index_name: str | None = None
    user_name: str | None = None
    password: str | None = None
    database_name: str | None = None
    table_name: str | None = None
    is_new_creation: bool = False
    graph_write_enabled: bool = False
    graph_name: str | None = None

    PROVIDER_AZURE_AI_SEARCH = _PROVIDER_AZURE_AI_SEARCH
    PROVIDER_POSTGRESQL_PGVECTOR = _PROVIDER_POSTGRESQL_PGVECTOR
    DEFAULT_GRAPH_NAME = DEFAULT_GRAPH_NAME

    def get_effective_graph_name(self) -> str:
        """テーブル名から導出した（または明示された）グラフ名を返す。

        Returns
        -------
        str
            有効なグラフ名。

        Raises
        ------
        ValueError
            名前が不正なとき。
        """
        return CoreDerivedResourceNameResolver().resolve(
            self.table_name or "",
            CoreDerivedResourceTargetKind.AGE_GRAPH,
            self.graph_name,
        )

    def get_effective_index_name(self) -> str:
        """テーブル名から導出した（または明示された）インデックス名を返す。

        Returns
        -------
        str
            有効なインデックス名。

        Raises
        ------
        ValueError
            名前が不正なとき。
        """
        kind = (
            CoreDerivedResourceTargetKind.AZURE_SEARCH_INDEX
            if self.is_azure_search_provider()
            else CoreDerivedResourceTargetKind.POSTGRES_INDEX
        )
        return CoreDerivedResourceNameResolver().resolve(
            self.table_name or "", kind, self.index_name
        )

    def is_azure_search_provider(self) -> bool:
        """Azure AI Search か。

        Returns
        -------
        bool
            Azure AI Search（旧名 AzureOpenAI を含む）なら True。
        """
        return self._is_provider(
            _PROVIDER_AZURE_AI_SEARCH, _PROVIDER_LEGACY_AZURE_OPENAI
        )

    def is_postgre_sql_provider(self) -> bool:
        """PostgreSQL(PGVector) か。

        Returns
        -------
        bool
            PostgreSQL(PGVector)（旧名を含む）なら True。
        """
        return self._is_provider(
            _PROVIDER_POSTGRESQL_PGVECTOR,
            _PROVIDER_LEGACY_POSTGRESQL,
            _PROVIDER_LEGACY_PGVECTOR,
        )

    def _is_provider(self, *supported_names: str) -> bool:
        """ベンダー名が対応する名前のどれかと（大文字小文字を無視して）一致するか。

        Parameters
        ----------
        *supported_names : str
            対応する名前。

        Returns
        -------
        bool
            一致すれば True。
        """
        if self.vendor_name is None:
            return False
        trimmed = self.vendor_name.strip().lower()
        return any(name.lower() == trimmed for name in supported_names)
