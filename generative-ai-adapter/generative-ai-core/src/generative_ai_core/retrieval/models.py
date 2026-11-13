"""検索のリクエスト・結果・設定の値オブジェクト（移植元 jp.co.unirita.ai.core.retrieval）。

`CoreRetrievalRequest`・`CoreRetrievalResult`・`CoreVectorSearchResult`・
`CoreGraphContextCandidate`・`CoreGraphRagSearchSetting`・
`CoreProviderLlmRerankAttributes` をまとめて移した。
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.provider.model import RuntimeProviderConfiguration
from generative_ai_core.vector.target import CoreVectorDbTarget

DEFAULT_GRAPH_NAME = "secuaigent_core_graph"
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")


class CoreProviderLlmRerankAttributes:
    """検索リクエストの属性のうち、プロバイダ LLM リランク用のキー。"""

    ENABLED = "s04.providerLlmRerank"
    PROVIDER = "s04.providerLlmRerankProvider"
    ENDPOINT = "s04.providerLlmRerankEndpoint"
    CREDENTIAL = "s04.providerLlmRerankCredential"
    CREDENTIAL_KIND = "s04.providerLlmRerankCredentialKind"
    MODEL = "s04.providerLlmRerankModel"
    TENANT_ID = "s04.providerLlmRerankTenantId"
    TIMEOUT_SECONDS = "s04.providerLlmRerankTimeoutSeconds"


@dataclass(frozen=True)
class CoreGraphRagSearchSetting:
    """Graph RAG 検索の設定。

    Attributes
    ----------
    enabled : bool
        有効か。
    graph_name : str
        AGE graph 名。空なら既定の名前。
    provider_name : str
        プロバイダ名。
    """

    enabled: bool
    graph_name: str = DEFAULT_GRAPH_NAME
    provider_name: str = ""

    def __post_init__(self) -> None:
        """graph 名を検証し、プロバイダ名を整える。

        Raises
        ------
        ValueError
            graph 名が安全な識別子でないとき。
        """
        name = (self.graph_name or "").strip() or DEFAULT_GRAPH_NAME
        if _SAFE_IDENTIFIER.fullmatch(name) is None:
            raise ValueError("graphName must be a safe PostgreSQL identifier")
        object.__setattr__(self, "graph_name", name)
        object.__setattr__(self, "provider_name", (self.provider_name or "").strip())

    @classmethod
    def enabled_for(
        cls, graph_name: str | None, provider_name: str | None
    ) -> "CoreGraphRagSearchSetting":
        """有効な設定を作る。

        Parameters
        ----------
        graph_name : str | None
            AGE graph 名。
        provider_name : str | None
            プロバイダ名。

        Returns
        -------
        CoreGraphRagSearchSetting
            有効な設定。
        """
        return cls(True, graph_name or "", provider_name or "")

    @classmethod
    def disabled(cls, provider_name: str | None) -> "CoreGraphRagSearchSetting":
        """無効な設定を作る。

        Parameters
        ----------
        provider_name : str | None
            プロバイダ名。

        Returns
        -------
        CoreGraphRagSearchSetting
            無効な設定。
        """
        return cls(False, DEFAULT_GRAPH_NAME, provider_name or "")

    def should_run_graph_search(self) -> bool:
        """Graph 検索を実行するかを返す。

        Returns
        -------
        bool
            有効で、プロバイダが PostgreSQL なら True。
        """
        return self.enabled and self.is_postgresql_provider()

    def is_postgresql_provider(self) -> bool:
        """プロバイダが PostgreSQL（pgvector）かを返す。

        Returns
        -------
        bool
            名前に postgres か pgvector を含めば True。
        """
        normalized = self.provider_name.lower()
        return "postgres" in normalized or "pgvector" in normalized


@dataclass(frozen=True)
class CoreRetrievalRequest:
    """検索のリクエスト。

    Attributes
    ----------
    provider_id : str
        検索プロバイダ（`PostgreSQL`・`AzureOpenAI` など）。
    network_setting : CoreNetworkSetting
        ネットワーク設定。
    query : str
        検索文字列。
    max_results : int
        最大件数（1 未満は 1 にする）。
    graph_rag_search_setting : CoreGraphRagSearchSetting
        Graph RAG の設定。
    vector_db_target : CoreVectorDbTarget | None
        ベクトルDB の接続先。
    embedding_provider_configuration : RuntimeProviderConfiguration | None
        クエリの埋め込みに使うプロバイダの設定。
    query_vector : tuple[float, ...]
        あらかじめ用意したクエリのベクトル。
    attributes : Mapping[str, str]
        追加の属性（キー・値とも前後の空白を除く）。
    """

    provider_id: str
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    query: str = ""
    max_results: int = 1
    graph_rag_search_setting: CoreGraphRagSearchSetting | None = None
    vector_db_target: CoreVectorDbTarget | None = None
    embedding_provider_configuration: RuntimeProviderConfiguration | None = field(
        default=None, repr=False
    )
    query_vector: Sequence[float] = ()
    attributes: Mapping[str, str] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """各項目を正規化する。

        Raises
        ------
        ValueError
            provider_id が空のとき。
        """
        if self.provider_id is None or not self.provider_id.strip():
            raise ValueError("providerId must not be blank")
        provider_id = self.provider_id.strip()
        object.__setattr__(self, "provider_id", provider_id)
        object.__setattr__(
            self,
            "network_setting",
            self.network_setting or CoreNetworkSetting.defaults(),
        )
        object.__setattr__(self, "query", self.query or "")
        object.__setattr__(self, "max_results", max(1, self.max_results))
        object.__setattr__(
            self,
            "graph_rag_search_setting",
            self.graph_rag_search_setting
            or CoreGraphRagSearchSetting.disabled(provider_id),
        )
        object.__setattr__(self, "query_vector", tuple(self.query_vector or ()))
        attributes = {
            key.strip(): value.strip()
            for key, value in (self.attributes or {}).items()
            if key is not None and key.strip() and value is not None
        }
        object.__setattr__(self, "attributes", attributes)

    @classmethod
    def builder(cls, provider_id: str) -> "CoreRetrievalRequestBuilder":
        """ビルダーを作る。

        Parameters
        ----------
        provider_id : str
            検索プロバイダ。

        Returns
        -------
        CoreRetrievalRequestBuilder
            ビルダー。
        """
        return CoreRetrievalRequestBuilder(provider_id)

    def graph_setting(self) -> CoreGraphRagSearchSetting:
        """Graph RAG の設定を返す（`__post_init__` で必ず入る）。

        Returns
        -------
        CoreGraphRagSearchSetting
            Graph RAG の設定。
        """
        assert self.graph_rag_search_setting is not None
        return self.graph_rag_search_setting


class CoreRetrievalRequestBuilder:
    """移植元 CoreRetrievalRequest.Builder。"""

    def __init__(self, provider_id: str) -> None:
        """プロバイダ ID を指定する。

        Parameters
        ----------
        provider_id : str
            検索プロバイダ。
        """
        self._provider_id = provider_id
        self._network_setting = CoreNetworkSetting.defaults()
        self._query = ""
        self._max_results = 1
        self._graph: CoreGraphRagSearchSetting | None = None
        self._target: CoreVectorDbTarget | None = None
        self._embedding: RuntimeProviderConfiguration | None = None
        self._query_vector: tuple[float, ...] = ()
        self._attributes: dict[str, str] = {}

    def network_setting(
        self, value: CoreNetworkSetting
    ) -> "CoreRetrievalRequestBuilder":
        """ネットワーク設定を指定する。

        Parameters
        ----------
        value : CoreNetworkSetting
            ネットワーク設定。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._network_setting = value
        return self

    def query(self, value: str) -> "CoreRetrievalRequestBuilder":
        """検索文字列を指定する。

        Parameters
        ----------
        value : str
            検索文字列。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._query = value
        return self

    def max_results(self, value: int) -> "CoreRetrievalRequestBuilder":
        """最大件数を指定する。

        Parameters
        ----------
        value : int
            最大件数。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._max_results = value
        return self

    def graph_rag_search_setting(
        self, value: CoreGraphRagSearchSetting | None
    ) -> "CoreRetrievalRequestBuilder":
        """Graph RAG の設定を指定する。

        Parameters
        ----------
        value : CoreGraphRagSearchSetting | None
            Graph RAG の設定。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._graph = value
        return self

    def vector_db_target(
        self, value: CoreVectorDbTarget | None
    ) -> "CoreRetrievalRequestBuilder":
        """ベクトルDB の接続先を指定する。

        Parameters
        ----------
        value : CoreVectorDbTarget | None
            接続先。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._target = value
        return self

    def embedding_provider_configuration(
        self, value: RuntimeProviderConfiguration | None
    ) -> "CoreRetrievalRequestBuilder":
        """クエリの埋め込みに使うプロバイダの設定を指定する。

        Parameters
        ----------
        value : RuntimeProviderConfiguration | None
            プロバイダの設定。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._embedding = value
        return self

    def query_vector(
        self, value: Sequence[float] | None
    ) -> "CoreRetrievalRequestBuilder":
        """クエリのベクトルを指定する。

        Parameters
        ----------
        value : Sequence[float] | None
            ベクトル。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        self._query_vector = tuple(value or ())
        return self

    def attribute(
        self, key: str | None, value: str | None
    ) -> "CoreRetrievalRequestBuilder":
        """属性を足す（キーが空・値が None なら無視する）。

        Parameters
        ----------
        key : str | None
            キー。
        value : str | None
            値。

        Returns
        -------
        CoreRetrievalRequestBuilder
            このビルダー。
        """
        if key is not None and key.strip() and value is not None:
            self._attributes[key.strip()] = value.strip()
        return self

    def build(self) -> CoreRetrievalRequest:
        """リクエストを作る。

        Returns
        -------
        CoreRetrievalRequest
            リクエスト。
        """
        return CoreRetrievalRequest(
            self._provider_id,
            self._network_setting,
            self._query,
            self._max_results,
            self._graph,
            self._target,
            self._embedding,
            self._query_vector,
            self._attributes,
        )


def _visible(identifier: str, evidence: Mapping[str, str]) -> bool:
    """証拠から見て、そのコンテキストを出力してよいかを返す。

    Parameters
    ----------
    identifier : str
        コンテキスト（チャンク）の ID。
    evidence : Mapping[str, str]
        証拠。

    Returns
    -------
    bool
        現行でなかった・削除された・古いと記録されていなければ True。
    """

    def flag(key: str) -> str:
        """証拠の値を小文字で取り出す。

        Parameters
        ----------
        key : str
            キー。

        Returns
        -------
        str
            小文字の値。なければ空文字。
        """
        return evidence.get(key, "").lower()

    return not (
        flag(f"sourceLifecycle.current.{identifier}") == "false"
        or flag(f"sourceLifecycle.deleted.{identifier}") == "true"
        or flag(f"sourceLifecycle.stale.{identifier}") == "true"
        or flag(f"graphEvidence.current.{identifier}") == "false"
        or flag(f"graphEvidence.stale.{identifier}") == "true"
    )


@dataclass(frozen=True)
class CoreRetrievalResult:
    """検索の結果（ID の並び・Graph で広げたか・失敗・証拠）。

    Attributes
    ----------
    ordered_ids : tuple[str, ...]
        チャンク ID を関連の高い順に並べたもの。
    graph_expanded : bool
        Graph で広げた結果か。
    failure : CoreFailure | None
        失敗。なければ None。
    evidence : Mapping[str, str]
        コンテキストごとの証拠（`content.<id>` など）。
    """

    ordered_ids: Sequence[str] = ()
    graph_expanded: bool = False
    failure: CoreFailure | None = None
    evidence: Mapping[str, str] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """各項目を不変にする。"""
        object.__setattr__(self, "ordered_ids", tuple(self.ordered_ids or ()))
        object.__setattr__(self, "evidence", dict(self.evidence or {}))

    @classmethod
    def success(
        cls,
        ordered_ids: Sequence[str] | None,
        graph_expanded: bool,
        evidence: Mapping[str, str] | None = None,
    ) -> "CoreRetrievalResult":
        """成功の結果を作る。

        Parameters
        ----------
        ordered_ids : Sequence[str] | None
            チャンク ID の並び。
        graph_expanded : bool
            Graph で広げたか。
        evidence : Mapping[str, str] | None
            証拠。

        Returns
        -------
        CoreRetrievalResult
            成功の結果。
        """
        return cls(ordered_ids or (), graph_expanded, None, evidence or {})

    @classmethod
    def of_failure(
        cls, failure: CoreFailure, evidence: Mapping[str, str] | None = None
    ) -> "CoreRetrievalResult":
        """失敗の結果を作る（ID は空にする）。

        Parameters
        ----------
        failure : CoreFailure
            失敗。
        evidence : Mapping[str, str] | None
            証拠。

        Returns
        -------
        CoreRetrievalResult
            失敗の結果。
        """
        return cls((), False, failure, evidence or {})

    def visible_ordered_ids(self) -> list[str]:
        """証拠から見て出力してよい ID だけを、並び順のまま返す。

        Returns
        -------
        list[str]
            ID の並び。
        """
        return [i for i in self.ordered_ids if _visible(i, self.evidence)]

    def to_quoted_tab_separated_ids(self) -> str:
        """`LEGACY_TSV` の形式（`"id"` をタブで区切り、末尾に改行）にする。

        Returns
        -------
        str
            TSV の 1 行。
        """
        return "\t".join(f'"{i}"' for i in self.visible_ordered_ids()) + "\n"


@dataclass(frozen=True)
class CoreVectorSearchResult:
    """ベクトル検索の 1 行（ID・本文・順位・証拠）。

    Attributes
    ----------
    id : str
        チャンク ID。
    content : str
        本文。
    rank : int
        順位（0 未満は 0）。
    evidence : Mapping[str, str]
        この行の証拠。
    """

    id: str
    content: str = ""
    rank: int = 0
    evidence: Mapping[str, str] = field(default_factory=dict, hash=False)

    def __post_init__(self) -> None:
        """項目を正規化する。

        Raises
        ------
        ValueError
            id が空のとき。
        """
        if self.id is None or not self.id.strip():
            raise ValueError("id must not be blank")
        object.__setattr__(self, "id", self.id.strip())
        object.__setattr__(self, "content", self.content or "")
        object.__setattr__(self, "rank", max(0, self.rank))
        object.__setattr__(self, "evidence", dict(self.evidence or {}))


def _text(value: str | None) -> str:
    """前後の空白を除く（None は空文字）。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str
        正規化した文字列。
    """
    return "" if value is None else value.strip()


@dataclass(frozen=True)
class CoreGraphContextCandidate:
    """Graph で見つけたコンテキストの候補。

    Attributes
    ----------
    context_id : str
        コンテキスト（ベクトル行）の ID。
    chunk_id : str
        チャンク ID。
    vector_row_id : str
        ベクトル行 ID。
    file_id : str
        ファイル ID。
    sequence : int
        チャンクの順番。
    source_seed_id : str
        元になった種（シード）の ID。
    source_seed_rank : int
        種の順位（0 未満は 0）。
    relation_kind : str
        関係の種類（`SEED`・`NEXT_CHUNK`・`GRAPH_NEIGHBOR`・`BUSINESS_RELATIONSHIP`）。
    source_edge_id : str
        根拠のエッジ ID。
    source_evidence_id : str
        根拠の証拠 ID。
    candidate_trust : str
        信頼度。空なら `unknown`。
    source_file_path : str
        元ファイルのパス。
    """

    context_id: str
    chunk_id: str = ""
    vector_row_id: str = ""
    file_id: str = ""
    sequence: int = 0
    source_seed_id: str = ""
    source_seed_rank: int = 0
    relation_kind: str = "GRAPH_NEIGHBOR"
    source_edge_id: str = ""
    source_evidence_id: str = ""
    candidate_trust: str = "unknown"
    source_file_path: str = ""

    def __post_init__(self) -> None:
        """項目を正規化する。

        Raises
        ------
        ValueError
            context_id が空のとき。
        """
        if self.context_id is None or not self.context_id.strip():
            raise ValueError("contextId must not be blank")
        object.__setattr__(self, "context_id", self.context_id.strip())
        for name in (
            "chunk_id",
            "vector_row_id",
            "file_id",
            "source_seed_id",
            "source_edge_id",
            "source_evidence_id",
            "source_file_path",
        ):
            object.__setattr__(self, name, _text(getattr(self, name)))
        object.__setattr__(
            self, "relation_kind", _text(self.relation_kind) or "GRAPH_NEIGHBOR"
        )
        object.__setattr__(
            self, "candidate_trust", _text(self.candidate_trust) or "unknown"
        )
        object.__setattr__(self, "source_seed_rank", max(0, self.source_seed_rank))

    def is_evidence_linked_business_relationship(self) -> bool:
        """根拠のエッジと証拠が付いた業務上の関係かを返す。

        Returns
        -------
        bool
            そうなら True。
        """
        return (
            self.relation_kind == "BUSINESS_RELATIONSHIP"
            and bool(self.source_edge_id)
            and bool(self.source_evidence_id)
        )
