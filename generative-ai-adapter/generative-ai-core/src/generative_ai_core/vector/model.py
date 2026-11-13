"""ベクトルDB 操作の入出力（移植元 jp.co.unirita.ai.core.vector の record 群）。

移植元の record は frozen dataclass にし、コンストラクタでの正規化は
`__post_init__` で行う。リストは tuple に固めて不変にする。
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol

from generative_ai_core.failure import CoreFailure
from generative_ai_core.network.setting import CoreNetworkSetting
from generative_ai_core.vector.target import CoreVectorDbTarget

DEFAULT_GRAPH_NAME = "secuaigent_core_graph"
_GRAPH_NAME_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
NO_CAUSE_CATEGORY = "NONE"
DISABLED_CAUSE_CATEGORY = "DISABLED"
REASON_ALREADY_ABSENT = "already_absent"
REASON_GRAPH_NODE_UNWRITTEN = "graph_node_unwritten"


def _set(obj: object, name: str, value: Any) -> None:
    """frozen dataclass のフィールドを正規化した値で置き換える。

    Parameters
    ----------
    obj : object
        対象の dataclass インスタンス。
    name : str
        フィールド名。
    value : Any
        設定する値。
    """
    object.__setattr__(obj, name, value)


def _strip(value: str | None) -> str:
    """None を空文字にし、前後の空白を除く。

    Parameters
    ----------
    value : str | None
        元の文字列。

    Returns
    -------
    str
        正規化した文字列。
    """
    return "" if value is None else value.strip()


def _text(value: str | None) -> str:
    """None を空文字にする（空白は除かない）。

    Parameters
    ----------
    value : str | None
        元の文字列。

    Returns
    -------
    str
        正規化した文字列。
    """
    return "" if value is None else value


def validate_graph_name(graph_name: str | None) -> str:
    """AGE のグラフ名が安全な形式か検証する（移植元 CoreGraphNameValidator）。

    Parameters
    ----------
    graph_name : str | None
        グラフ名。

    Returns
    -------
    str
        検証したグラフ名（そのまま）。

    Raises
    ------
    ValueError
        `[A-Za-z_][A-Za-z0-9_]{0,62}` に一致しないとき。
    """
    if graph_name is None or _GRAPH_NAME_PATTERN.fullmatch(graph_name) is None:
        raise ValueError("graphName must match [A-Za-z_][A-Za-z0-9_]{0,62}")
    return graph_name


class CoreVectorDbOperation(Enum):
    """ベクトルDB の操作。"""

    SAVE = "SAVE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    SEARCH = "SEARCH"
    GRAPH_WRITE = "GRAPH_WRITE"
    GRAPH_DELETE = "GRAPH_DELETE"

    def is_graph_only(self) -> bool:
        """グラフだけを対象にする操作か。

        Returns
        -------
        bool
            GRAPH_WRITE か GRAPH_DELETE なら True。
        """
        return self in (
            CoreVectorDbOperation.GRAPH_WRITE,
            CoreVectorDbOperation.GRAPH_DELETE,
        )


@dataclass(frozen=True)
class CoreVectorDbPayload:
    """保存・更新・削除する 1 行分の内容。"""

    id: str = ""
    content: str = ""
    vector: tuple[float, ...] = ()
    file_unique_id: str = ""
    source_file_path: str = ""

    def __post_init__(self) -> None:
        """id を trim し、None を空に、vector を tuple に正規化する。"""
        _set(self, "id", _strip(self.id))
        _set(self, "content", _text(self.content))
        _set(self, "vector", tuple(self.vector or ()))
        _set(self, "file_unique_id", _text(self.file_unique_id))
        _set(self, "source_file_path", _text(self.source_file_path))

    @classmethod
    def delete(cls, id: str | None) -> "CoreVectorDbPayload":
        """id だけを指定した削除用の内容を作る。

        Parameters
        ----------
        id : str | None
            ベクトル行の ID。

        Returns
        -------
        CoreVectorDbPayload
            削除用の内容。
        """
        return cls(id or "", "", (), "")

    @classmethod
    def delete_file_unique_id(cls, file_unique_id: str | None) -> "CoreVectorDbPayload":
        """ファイル ID だけを指定した削除用の内容を作る。

        Parameters
        ----------
        file_unique_id : str | None
            ファイル ID（fileid 列）。

        Returns
        -------
        CoreVectorDbPayload
            削除用の内容。
        """
        return cls("", "", (), file_unique_id or "")


@dataclass(frozen=True)
class CoreVectorSearchMatch:
    """検索で見つかった 1 行。"""

    id: str = ""
    content: str = ""
    vector: tuple[float, ...] = ()
    file_unique_id: str = ""

    def __post_init__(self) -> None:
        """None を空に、vector を tuple に正規化する。"""
        _set(self, "id", _text(self.id))
        _set(self, "content", _text(self.content))
        _set(self, "vector", tuple(self.vector or ()))
        _set(self, "file_unique_id", _text(self.file_unique_id))


def _require(value: str | None, field_name: str) -> str:
    """空でない値を返す。

    Parameters
    ----------
    value : str | None
        値。
    field_name : str
        エラーメッセージに出す項目名。

    Returns
    -------
    str
        trim した値。

    Raises
    ------
    ValueError
        空のとき。
    """
    if value is None or not value.strip():
        raise ValueError(f"{field_name} must not be blank")
    return value.strip()


@dataclass(frozen=True)
class CoreGraphWriteSetting:
    """Graph 書き込みの設定。"""

    enabled: bool = False
    graph_name: str = DEFAULT_GRAPH_NAME

    def __post_init__(self) -> None:
        """グラフ名を既定値で補い、有効なときは形式を検証する。"""
        name = (
            DEFAULT_GRAPH_NAME
            if self.graph_name is None or not self.graph_name.strip()
            else self.graph_name.strip()
        )
        _set(self, "graph_name", validate_graph_name(name) if self.enabled else name)

    @classmethod
    def disabled(cls) -> "CoreGraphWriteSetting":
        """無効な設定を作る。

        Returns
        -------
        CoreGraphWriteSetting
            Graph 書き込みなしの設定。
        """
        return cls(False, DEFAULT_GRAPH_NAME)

    @classmethod
    def enabled_with(cls, graph_name: str | None) -> "CoreGraphWriteSetting":
        """有効な設定を作る（移植元 `enabled(graphName)`）。

        Parameters
        ----------
        graph_name : str | None
            グラフ名。

        Returns
        -------
        CoreGraphWriteSetting
            Graph 書き込みありの設定。
        """
        return cls(True, graph_name or "")


class CoreGraphWriteStatus(Enum):
    """Graph 書き込みの状態。"""

    DISABLED = "DISABLED"
    SUCCESS = "SUCCESS"
    FAILED_CONFIGURATION = "FAILED_CONFIGURATION"
    FAILED_EXTENSION_UNAVAILABLE = "FAILED_EXTENSION_UNAVAILABLE"
    FAILED_WRITE = "FAILED_WRITE"

    def is_failed(self) -> bool:
        """失敗の状態か。

        Returns
        -------
        bool
            失敗の 3 状態なら True。
        """
        return self in (
            CoreGraphWriteStatus.FAILED_CONFIGURATION,
            CoreGraphWriteStatus.FAILED_EXTENSION_UNAVAILABLE,
            CoreGraphWriteStatus.FAILED_WRITE,
        )


@dataclass(frozen=True)
class CoreGraphWriteResult:
    """Graph 書き込みの結果。"""

    status: CoreGraphWriteStatus = CoreGraphWriteStatus.DISABLED
    file_id: str = ""
    chunk_ids: tuple[str, ...] = ()
    message: str = ""
    cause_category: str = NO_CAUSE_CATEGORY

    def __post_init__(self) -> None:
        """正規化し、メッセージの秘密情報を伏せる。"""
        _set(self, "status", self.status or CoreGraphWriteStatus.DISABLED)
        _set(self, "file_id", _strip(self.file_id))
        _set(self, "chunk_ids", tuple(self.chunk_ids or ()))
        # 移植元はサニタイズ後の要約に置き換える（message に cause を渡す前の値で作る）
        _set(self, "message", CoreFailure.of(self.cause_category, self.message).summary)
        _set(
            self,
            "cause_category",
            NO_CAUSE_CATEGORY
            if self.cause_category is None or not self.cause_category.strip()
            else self.cause_category.strip(),
        )

    @classmethod
    def disabled(cls) -> "CoreGraphWriteResult":
        """無効（書き込みなし）の結果を作る。

        Returns
        -------
        CoreGraphWriteResult
            DISABLED の結果。
        """
        return cls(
            CoreGraphWriteStatus.DISABLED, "", (), "Graph write is disabled.",
            DISABLED_CAUSE_CATEGORY,
        )  # fmt: skip

    @classmethod
    def success(
        cls, file_id: str, chunk_ids: "list[str] | tuple[str, ...]"
    ) -> "CoreGraphWriteResult":
        """成功の結果を作る。

        Parameters
        ----------
        file_id : str
            ファイル ID。
        chunk_ids : list[str] | tuple[str, ...]
            対象のチャンク（ベクトル行）ID。

        Returns
        -------
        CoreGraphWriteResult
            SUCCESS の結果。
        """
        return cls(
            CoreGraphWriteStatus.SUCCESS, file_id, tuple(chunk_ids),
            "Graph write succeeded.", NO_CAUSE_CATEGORY,
        )  # fmt: skip

    @classmethod
    def absent_skipped(
        cls, chunk_ids: "list[str] | tuple[str, ...]", reason_code: str
    ) -> "CoreGraphWriteResult":
        """対象がすでに存在せず何もしなかった結果を作る。

        Parameters
        ----------
        chunk_ids : list[str] | tuple[str, ...]
            対象のチャンク ID。
        reason_code : str
            理由コード（`already_absent` など）。

        Returns
        -------
        CoreGraphWriteResult
            SUCCESS で原因分類が理由コードの結果。
        """
        return cls(
            CoreGraphWriteStatus.SUCCESS, "", tuple(chunk_ids),
            "Graph target already absent.", reason_code,
        )  # fmt: skip

    def is_absent_skipped(self) -> bool:
        """対象不在でスキップした結果か。

        Returns
        -------
        bool
            原因分類が `already_absent` か `graph_node_unwritten` なら True。
        """
        return self.cause_category in (
            REASON_ALREADY_ABSENT,
            REASON_GRAPH_NODE_UNWRITTEN,
        )

    @classmethod
    def failure(
        cls,
        status: CoreGraphWriteStatus,
        file_id: str,
        chunk_ids: "list[str] | tuple[str, ...]",
        message: str | None,
        cause_category: str,
    ) -> "CoreGraphWriteResult":
        """失敗の結果を作る。

        Parameters
        ----------
        status : CoreGraphWriteStatus
            失敗の状態。
        file_id : str
            ファイル ID。
        chunk_ids : list[str] | tuple[str, ...]
            対象のチャンク ID。
        message : str | None
            失敗メッセージ（秘密情報は伏せる）。
        cause_category : str
            原因分類。

        Returns
        -------
        CoreGraphWriteResult
            失敗の結果。
        """
        return cls(status, file_id, tuple(chunk_ids), message or "", cause_category)

    def is_failed(self) -> bool:
        """失敗か。

        Returns
        -------
        bool
            状態が失敗なら True。
        """
        return self.status.is_failed()


@dataclass(frozen=True)
class CoreGraphChunkWritePayload:
    """Graph に書く 1 チャンク分（または削除するベクトル行 ID の一覧）。"""

    file_id: str = ""
    file_path: str = ""
    vector_row_id: str = ""
    chunk_sequence: int = 0
    content: str = ""
    previous_vector_row_id: str = ""
    delete_vector_row_ids: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        """文字列を trim し、削除対象 ID の空要素を除く。"""
        _set(self, "file_id", _strip(self.file_id))
        _set(self, "file_path", _strip(self.file_path))
        _set(self, "vector_row_id", _strip(self.vector_row_id))
        _set(self, "content", _text(self.content))
        _set(self, "previous_vector_row_id", _strip(self.previous_vector_row_id))
        _set(
            self,
            "delete_vector_row_ids",
            tuple(
                i.strip() for i in (self.delete_vector_row_ids or ()) if i and i.strip()
            ),
        )

    @classmethod
    def none(cls) -> "CoreGraphChunkWritePayload":
        """空の内容を作る。

        Returns
        -------
        CoreGraphChunkWritePayload
            何も指定しない内容。
        """
        return cls()

    @classmethod
    def chunk(
        cls,
        file_id: str,
        file_path: str,
        vector_row_id: str,
        chunk_sequence: int,
        content: str,
        previous_vector_row_id: str,
    ) -> "CoreGraphChunkWritePayload":
        """1 チャンクを書く内容を作る。

        Parameters
        ----------
        file_id : str
            ファイル ID。
        file_path : str
            ファイルパス。
        vector_row_id : str
            ベクトル行 ID。
        chunk_sequence : int
            ファイル内の連番。
        content : str
            チャンクの本文。
        previous_vector_row_id : str
            直前のチャンクのベクトル行 ID。

        Returns
        -------
        CoreGraphChunkWritePayload
            書き込み用の内容。
        """
        return cls(
            file_id, file_path, vector_row_id, chunk_sequence, content,
            previous_vector_row_id, (),
        )  # fmt: skip

    @classmethod
    def delete_ids(
        cls, vector_row_ids: "list[str] | tuple[str, ...]"
    ) -> "CoreGraphChunkWritePayload":
        """削除するベクトル行 ID の一覧を持つ内容を作る。

        Parameters
        ----------
        vector_row_ids : list[str] | tuple[str, ...]
            ベクトル行 ID。

        Returns
        -------
        CoreGraphChunkWritePayload
            削除用の内容。
        """
        return cls("", "", "", 0, "", "", tuple(vector_row_ids))

    def has_chunk(self) -> bool:
        """チャンクを書く内容か。

        Returns
        -------
        bool
            file_id と vector_row_id がともにあれば True。
        """
        return bool(self.file_id.strip()) and bool(self.vector_row_id.strip())

    def has_delete_ids(self) -> bool:
        """削除対象 ID があるか。

        Returns
        -------
        bool
            あれば True。
        """
        return bool(self.delete_vector_row_ids)


@dataclass(frozen=True)
class CoreVectorDbRequest:
    """ベクトルDB 操作の要求。"""

    provider_id: str
    operation: CoreVectorDbOperation = CoreVectorDbOperation.SAVE
    network_setting: CoreNetworkSetting = field(
        default_factory=CoreNetworkSetting.defaults
    )
    target: CoreVectorDbTarget = field(default_factory=CoreVectorDbTarget)
    payload: CoreVectorDbPayload = field(default_factory=CoreVectorDbPayload)
    metadata: dict[str, str] = field(default_factory=dict)
    graph_write_setting: CoreGraphWriteSetting = field(
        default_factory=CoreGraphWriteSetting.disabled
    )
    graph_chunk_payload: CoreGraphChunkWritePayload = field(
        default_factory=CoreGraphChunkWritePayload.none
    )

    def __post_init__(self) -> None:
        """未指定を既定値で補う。

        Raises
        ------
        ValueError
            provider_id が空のとき。
        """
        if self.provider_id is None or not self.provider_id.strip():
            raise ValueError("providerId must not be blank")
        _set(self, "provider_id", self.provider_id.strip())
        _set(self, "operation", self.operation or CoreVectorDbOperation.SAVE)
        _set(
            self,
            "network_setting",
            self.network_setting or CoreNetworkSetting.defaults(),
        )
        _set(self, "target", self.target or CoreVectorDbTarget())
        _set(self, "payload", self.payload or CoreVectorDbPayload())
        _set(self, "metadata", dict(self.metadata or {}))
        _set(
            self,
            "graph_write_setting",
            self.graph_write_setting or CoreGraphWriteSetting.disabled(),
        )
        _set(
            self,
            "graph_chunk_payload",
            self.graph_chunk_payload or CoreGraphChunkWritePayload.none(),
        )

    @classmethod
    def builder(
        cls, provider_id: str, operation: CoreVectorDbOperation
    ) -> "CoreVectorDbRequestBuilder":
        """Builder を作る。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID（"PostgreSQL" / "AzureAISearch"）。
        operation : CoreVectorDbOperation
            操作。

        Returns
        -------
        CoreVectorDbRequestBuilder
            Builder。
        """
        return CoreVectorDbRequestBuilder(provider_id, operation)


class CoreVectorDbRequestBuilder:
    """`CoreVectorDbRequest` の Builder（移植元 CoreVectorDbRequest.Builder）。"""

    def __init__(self, provider_id: str, operation: CoreVectorDbOperation) -> None:
        """プロバイダ ID と操作を受け取る。

        Parameters
        ----------
        provider_id : str
            プロバイダ ID。
        operation : CoreVectorDbOperation
            操作。
        """
        self._provider_id = provider_id
        self._operation = operation
        self._network_setting: CoreNetworkSetting | None = CoreNetworkSetting.defaults()
        self._target: CoreVectorDbTarget | None = None
        self._payload: CoreVectorDbPayload | None = None
        self._metadata: dict[str, str] = {}
        self._graph_write_setting: CoreGraphWriteSetting | None = (
            CoreGraphWriteSetting.disabled()
        )
        self._graph_chunk_payload: CoreGraphChunkWritePayload | None = (
            CoreGraphChunkWritePayload.none()
        )

    def network_setting(
        self, value: CoreNetworkSetting | None
    ) -> "CoreVectorDbRequestBuilder":
        """ネットワーク設定を指定する。

        Parameters
        ----------
        value : CoreNetworkSetting | None
            ネットワーク設定。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        self._network_setting = value
        return self

    def target(self, value: CoreVectorDbTarget | None) -> "CoreVectorDbRequestBuilder":
        """接続先を指定する。

        Parameters
        ----------
        value : CoreVectorDbTarget | None
            接続先。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        self._target = value
        return self

    def payload(
        self, value: CoreVectorDbPayload | None
    ) -> "CoreVectorDbRequestBuilder":
        """内容を指定する。

        Parameters
        ----------
        value : CoreVectorDbPayload | None
            内容。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        self._payload = value
        return self

    def metadata(
        self, key: str | None, value: str | None
    ) -> "CoreVectorDbRequestBuilder":
        """メタデータを 1 件足す（キーが空・値が None なら無視）。

        Parameters
        ----------
        key : str | None
            キー（trim して使う）。
        value : str | None
            値。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        if key is not None and key.strip() and value is not None:
            self._metadata[key.strip()] = value
        return self

    def graph_write_setting(
        self, value: CoreGraphWriteSetting | None
    ) -> "CoreVectorDbRequestBuilder":
        """Graph 書き込みの設定を指定する。

        Parameters
        ----------
        value : CoreGraphWriteSetting | None
            Graph 書き込みの設定。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        self._graph_write_setting = value
        return self

    def graph_chunk_payload(
        self, value: CoreGraphChunkWritePayload | None
    ) -> "CoreVectorDbRequestBuilder":
        """Graph のチャンク内容を指定する。

        Parameters
        ----------
        value : CoreGraphChunkWritePayload | None
            Graph のチャンク内容。

        Returns
        -------
        CoreVectorDbRequestBuilder
            自分自身。
        """
        self._graph_chunk_payload = value
        return self

    def build(self) -> CoreVectorDbRequest:
        """要求を作る。

        Returns
        -------
        CoreVectorDbRequest
            作った要求。
        """
        return CoreVectorDbRequest(
            self._provider_id,
            self._operation,
            self._network_setting or CoreNetworkSetting.defaults(),
            self._target or CoreVectorDbTarget(),
            self._payload or CoreVectorDbPayload(),
            self._metadata,
            self._graph_write_setting or CoreGraphWriteSetting.disabled(),
            self._graph_chunk_payload or CoreGraphChunkWritePayload.none(),
        )


@dataclass(frozen=True)
class CoreVectorDbResult:
    """ベクトルDB 操作の結果。"""

    id: str = ""
    operation: CoreVectorDbOperation = CoreVectorDbOperation.SAVE
    success: bool = True
    failure: CoreFailure | None = None
    graph_result: CoreGraphWriteResult | None = None
    matches: tuple[CoreVectorSearchMatch, ...] = ()

    def __post_init__(self) -> None:
        """正規化し、失敗か Graph 失敗があれば success を False にする。"""
        _set(self, "id", _text(self.id))
        _set(self, "operation", self.operation or CoreVectorDbOperation.SAVE)
        _set(self, "matches", tuple(self.matches or ()))
        graph_ok = self.graph_result is None or not self.graph_result.is_failed()
        _set(self, "success", self.success and self.failure is None and graph_ok)

    @classmethod
    def ok(
        cls,
        id: str,
        operation: CoreVectorDbOperation,
        graph_result: CoreGraphWriteResult | None = None,
    ) -> "CoreVectorDbResult":
        """成功の結果を作る（移植元 `success(...)`。`success` は属性名と衝突するため `ok`）。

        Parameters
        ----------
        id : str
            結果の ID。
        operation : CoreVectorDbOperation
            操作。
        graph_result : CoreGraphWriteResult | None
            Graph の結果。

        Returns
        -------
        CoreVectorDbResult
            成功の結果。
        """
        return cls(id, operation, True, None, graph_result, ())

    @classmethod
    def search_success(
        cls,
        operation: CoreVectorDbOperation,
        matches: "list[CoreVectorSearchMatch] | tuple[CoreVectorSearchMatch, ...]",
    ) -> "CoreVectorDbResult":
        """検索成功の結果を作る。

        Parameters
        ----------
        operation : CoreVectorDbOperation
            操作。
        matches : list[CoreVectorSearchMatch] | tuple[CoreVectorSearchMatch, ...]
            見つかった行。

        Returns
        -------
        CoreVectorDbResult
            検索成功の結果。
        """
        return cls("", operation, True, None, None, tuple(matches))

    @classmethod
    def fail(
        cls,
        operation: CoreVectorDbOperation,
        failure: CoreFailure,
        graph_result: CoreGraphWriteResult | None = None,
    ) -> "CoreVectorDbResult":
        """失敗の結果を作る（移植元 `failure(...)`。属性名との衝突を避け `fail`）。

        Parameters
        ----------
        operation : CoreVectorDbOperation
            操作。
        failure : CoreFailure
            失敗。
        graph_result : CoreGraphWriteResult | None
            Graph の結果。

        Returns
        -------
        CoreVectorDbResult
            失敗の結果。
        """
        return cls("", operation, False, failure, graph_result, ())


class CoreVectorDbProvider(Protocol):
    """ベクトルDB のプロバイダ（移植元 CoreVectorDbProvider）。"""

    def provider_id(self) -> str:
        """プロバイダ ID を返す。

        Returns
        -------
        str
            プロバイダ ID。
        """
        ...

    def execute(self, request: CoreVectorDbRequest) -> CoreVectorDbResult:
        """要求を実行する。

        Parameters
        ----------
        request : CoreVectorDbRequest
            要求。

        Returns
        -------
        CoreVectorDbResult
            結果。
        """
        ...
