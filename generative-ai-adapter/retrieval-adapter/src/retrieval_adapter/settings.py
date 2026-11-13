"""Graph RAG・ハイブリッド検索の有効化の設定（移植元 graph・hybrid パッケージ）。

`GraphRagGraphNameValidator`・`GraphRagSearchSetting`・`HybridRetrievalEnablementSetting`
をまとめて移した。（`GraphRagSearchException`・`GraphRagSearchErrorSanitizer`・
`GraphRagSearchStatus` は移植元の main から使われていないため移植しない。）
"""

import re
from dataclasses import dataclass

from generative_ai_core.resource import (
    CoreDerivedResourceNameResolver,
    CoreDerivedResourceTargetKind,
)

from retrieval_adapter.adapterconfig import RetrievalVectorDbProperties

DEFAULT_GRAPH_NAME = "secuaigent_core_graph"
LEGACY_GRAPH_NAME = "embedding_graph"
MAX_GRAPH_NAME_LENGTH = 63
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
_FALSE_VALUES = frozenset({"0", "false", "no", "off", "disabled"})
_TRUE_VALUES = frozenset({"1", "true", "yes", "on", "enabled"})
INVALID_GRAPH_NAME_MESSAGE = "AGE graph 名に不正な値が入力されています。英数字とアンダースコアで指定してください。"


def is_valid_graph_name(graph_name: str | None) -> bool:
    """graph 名が許可された形式（英字・`_` で始まる 63 文字以内の英数字と `_`）かを返す。

    Parameters
    ----------
    graph_name : str | None
        graph 名。

    Returns
    -------
    bool
        許可された形式なら True。
    """
    return (
        graph_name is not None
        and len(graph_name) <= MAX_GRAPH_NAME_LENGTH
        and _SAFE_IDENTIFIER.fullmatch(graph_name) is not None
    )


def validate_graph_name(graph_name: str | None) -> str:
    """graph 名を検証する。

    Parameters
    ----------
    graph_name : str | None
        graph 名。

    Returns
    -------
    str
        検証済みの graph 名。

    Raises
    ------
    ValueError
        許可された形式でないとき。
    """
    if not is_valid_graph_name(graph_name):
        raise ValueError(INVALID_GRAPH_NAME_MESSAGE)
    assert graph_name is not None
    return graph_name


def _has_text(value: str | None) -> bool:
    """空白だけでない文字列かを返す。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    bool
        空白以外の文字があれば True。
    """
    return value is not None and bool(value.strip())


class GraphRagSearchSetting:
    """Graph RAG 検索の設定（プロパティ 45・46）。"""

    def __init__(
        self,
        enabled: bool,
        graph_name: str | None,
        provider_name: str | None,
        validate_name: bool,
        table_name: str | None = None,
        require_table_name: bool = False,
    ) -> None:
        """設定を作る。有効で検証する指定なら、graph 名を検証する。

        Parameters
        ----------
        enabled : bool
            有効か。
        graph_name : str | None
            graph 名。
        provider_name : str | None
            ベクトルDB のプロバイダ名。
        validate_name : bool
            graph 名を検証するか。
        table_name : str | None
            テーブル名（graph 名の導出元）。
        require_table_name : bool
            graph 名もテーブル名もないとき失敗にするか。

        Raises
        ------
        ValueError
            検証に失敗したとき。
        """
        self._enabled = enabled
        self._graph_name = graph_name
        self._provider_name = provider_name
        self._validate_name = validate_name
        self._table_name = table_name
        self._require_table_name = require_table_name
        if enabled and validate_name:
            self._require_graph_or_table_name_when_graph_search_active()
            validate_graph_name(self.effective_graph_name())

    @classmethod
    def from_vector_db(
        cls, vector_db_config: RetrievalVectorDbProperties | None
    ) -> "GraphRagSearchSetting":
        """ベクトルDB のプロパティから設定を作る。

        Parameters
        ----------
        vector_db_config : RetrievalVectorDbProperties | None
            ベクトルDB のプロパティ。

        Returns
        -------
        GraphRagSearchSetting
            設定。
        """
        if vector_db_config is None:
            return cls.disabled(None)
        return cls.from_properties(
            vector_db_config.graph_write_enabled,
            vector_db_config.graph_name,
            vector_db_config.vendor_name,
            vector_db_config.table_name,
        )

    @classmethod
    def from_properties(
        cls,
        enabled: bool,
        graph_name: str | None,
        provider_name: str | None,
        table_name: str | None = None,
    ) -> "GraphRagSearchSetting":
        """プロパティの値から設定を作る。

        Parameters
        ----------
        enabled : bool
            有効か。
        graph_name : str | None
            graph 名。
        provider_name : str | None
            ベクトルDB のプロバイダ名。
        table_name : str | None
            テーブル名。

        Returns
        -------
        GraphRagSearchSetting
            設定。
        """
        return cls(enabled, graph_name, provider_name, True, table_name, True)

    @classmethod
    def disabled(cls, provider_name: str | None) -> "GraphRagSearchSetting":
        """無効な設定を作る。

        Parameters
        ----------
        provider_name : str | None
            ベクトルDB のプロバイダ名。

        Returns
        -------
        GraphRagSearchSetting
            無効な設定。
        """
        return cls(False, DEFAULT_GRAPH_NAME, provider_name, True, None, False)

    @staticmethod
    def parse_enabled(value: str | None) -> bool:
        """プロパティ 45 の値（0/1・true/false・yes/no・on/off・enabled/disabled）を読む。

        Parameters
        ----------
        value : str | None
            値。

        Returns
        -------
        bool
            有効なら True。空は False。

        Raises
        ------
        ValueError
            上のどれでもないとき。
        """
        if value is None or not value.strip():
            return False
        normalized = value.strip().lower()
        if normalized in _FALSE_VALUES:
            return False
        if normalized in _TRUE_VALUES:
            return True
        raise ValueError("GraphRAG setting must be 0/1 or true/false")

    def is_enabled(self) -> bool:
        """有効かを返す。

        Returns
        -------
        bool
            有効なら True。
        """
        return self._enabled

    def is_graph_search_active(self) -> bool:
        """Graph 検索を実行するかを返す。

        Returns
        -------
        bool
            有効で、プロバイダが PostgreSQL なら True。
        """
        return self._enabled and self.is_postgresql_provider()

    def effective_graph_name(self) -> str:
        """graph 名を決める（明示 → テーブル名から導出 → 既定）。

        Returns
        -------
        str
            graph 名。
        """
        if _has_text(self._graph_name):
            assert self._graph_name is not None
            return self._graph_name.strip()
        if _has_text(self._table_name):
            return CoreDerivedResourceNameResolver().resolve(
                self._table_name,
                CoreDerivedResourceTargetKind.AGE_GRAPH,
                self._graph_name,
            )
        return DEFAULT_GRAPH_NAME

    def is_postgresql_provider(self) -> bool:
        """ベクトルDB のプロバイダが PostgreSQL（pgvector）かを返す。

        Returns
        -------
        bool
            名前に postgres か pgvector を含めば True。
        """
        if not _has_text(self._provider_name):
            return False
        assert self._provider_name is not None
        normalized = self._provider_name.lower()
        return "postgres" in normalized or "pgvector" in normalized

    def _require_graph_or_table_name_when_graph_search_active(self) -> None:
        """Graph 検索が有効なとき、graph 名かテーブル名がなければ失敗にする。

        Raises
        ------
        ValueError
            PostgreSQL で graph 名もテーブル名もなく、旧来の graph 名でもないとき。
        """
        if (
            self._require_table_name
            and self.is_postgresql_provider()
            and not _has_text(self._table_name)
            and not _has_text(self._graph_name)
            and self._graph_name != LEGACY_GRAPH_NAME
        ):
            raise ValueError("tableName is required for GraphRAG graph name validation")


@dataclass(frozen=True)
class HybridRetrievalEnablementSetting:
    """ハイブリッド検索の有効化（プロパティ 47）。

    Attributes
    ----------
    enabled : bool
        有効か。
    """

    enabled: bool = False

    @classmethod
    def disabled(cls) -> "HybridRetrievalEnablementSetting":
        """無効な設定を作る。

        Returns
        -------
        HybridRetrievalEnablementSetting
            無効な設定。
        """
        return cls(False)

    @classmethod
    def from_property(cls, value: str | None) -> "HybridRetrievalEnablementSetting":
        """プロパティ 47 の値から設定を作る（`1` のときだけ有効）。

        Parameters
        ----------
        value : str | None
            値。

        Returns
        -------
        HybridRetrievalEnablementSetting
            設定。
        """
        return cls(value == "1")

    @staticmethod
    def is_valid_property_value(value: str | None) -> bool:
        """プロパティ 47 の値を受け付けるか（どんな値でも受け付ける）。

        Parameters
        ----------
        value : str | None
            値。

        Returns
        -------
        bool
            常に True。
        """
        return True

    def is_runtime_enabled_for_provider(self, provider_id: str) -> bool:
        """このプロバイダでハイブリッド検索を実行するかを返す。

        Parameters
        ----------
        provider_id : str
            検索プロバイダ。

        Returns
        -------
        bool
            有効で、プロバイダが PostgreSQL なら True。
        """
        return self.enabled and provider_id == "PostgreSQL"
