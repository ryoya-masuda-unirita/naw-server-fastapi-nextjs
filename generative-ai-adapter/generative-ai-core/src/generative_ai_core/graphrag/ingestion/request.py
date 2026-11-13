"""取り込みの要求（移植元 IngestionRequest・IngestionOperation）。"""

import re
from dataclasses import dataclass
from enum import StrEnum

DEFAULT_TENANT_ID = "tenant-default"
DEFAULT_CLASSIFICATION = "tenant-default"
DEFAULT_MARKER_CONTEXT = "s03-compatible"
DEFAULT_DISPLAY_NAME = "ingestion-source"
DEFAULT_ACL_MODE = "tenant_wide"
_LABEL_BREAKS = re.compile(r"[\r\n\t]+")
_LABEL_SPACES = re.compile(r"\s{2,}")


class IngestionOperation(StrEnum):
    """取り込みの操作。"""

    SAVE = "SAVE"
    UPDATE = "UPDATE"


def _trim_to_none(value: str | None) -> str | None:
    """空白だけなら None、そうでなければ前後の空白を除く。

    Parameters
    ----------
    value : str | None
        文字列。

    Returns
    -------
    str | None
        整えた文字列。
    """
    if value is None or not value.strip():
        return None
    return value.strip()


def _trim_to_default(value: str | None, fallback: str) -> str:
    """空白だけなら既定値、そうでなければ前後の空白を除く。

    Parameters
    ----------
    value : str | None
        文字列。
    fallback : str
        既定値。

    Returns
    -------
    str
        整えた文字列。
    """
    if value is None or not value.strip():
        return fallback
    return value.strip()


def _sanitize_label(value: str | None) -> str:
    """表示名の改行・タブ・連続空白を 1 つの空白にする。

    Parameters
    ----------
    value : str | None
        表示名。

    Returns
    -------
    str
        整えた表示名。
    """
    label = _trim_to_default(value, DEFAULT_DISPLAY_NAME)
    label = _LABEL_BREAKS.sub(" ", label)
    return _LABEL_SPACES.sub(" ", label).strip()


@dataclass(frozen=True)
class IngestionRequest:
    """1 つの取り込み（チャンク）の要求。生成時に値を整える。"""

    tenant_id: str | None
    source_ref: str | None
    display_name: str | None
    normalized_body: str | None
    classification: str | None
    classification_rank: int
    acl_mode: str | None
    acl_principals: tuple[str, ...] | list[str] | None
    acl_revision: int
    deterministic_marker_context: str | None
    operation: IngestionOperation | None

    def __post_init__(self) -> None:
        """各項目を移植元のコンストラクタと同じ規則で整える。"""
        principals = tuple(
            p.strip() for p in (self.acl_principals or ()) if p and p.strip()
        )
        set_ = object.__setattr__
        set_(self, "tenant_id", _trim_to_none(self.tenant_id))
        set_(self, "source_ref", _trim_to_none(self.source_ref))
        set_(self, "display_name", _sanitize_label(self.display_name))
        set_(self, "normalized_body", self.normalized_body or "")
        set_(
            self,
            "classification",
            _trim_to_default(self.classification, DEFAULT_CLASSIFICATION),
        )
        set_(self, "acl_mode", _trim_to_none(self.acl_mode))
        set_(self, "acl_principals", principals)
        set_(
            self,
            "deterministic_marker_context",
            _trim_to_default(self.deterministic_marker_context, DEFAULT_MARKER_CONTEXT),
        )
        set_(self, "operation", self.operation or IngestionOperation.SAVE)

    def has_acl_context(self) -> bool:
        """ACL モードが指定されているか。

        Returns
        -------
        bool
            指定があれば True。
        """
        return bool(self.acl_mode and self.acl_mode.strip())

    @staticmethod
    def builder() -> "IngestionRequestBuilder":
        """要求のビルダーを作る。

        Returns
        -------
        IngestionRequestBuilder
            既定値入りのビルダー。
        """
        return IngestionRequestBuilder()


class IngestionRequestBuilder:
    """IngestionRequest のビルダー（移植元 IngestionRequest.Builder）。"""

    def __init__(self) -> None:
        """移植元と同じ既定値で初期化する。"""
        self._tenant_id: str | None = DEFAULT_TENANT_ID
        self._source_ref: str | None = None
        self._display_name: str | None = None
        self._normalized_body: str | None = None
        self._classification: str | None = DEFAULT_CLASSIFICATION
        self._classification_rank = 1
        self._acl_mode: str | None = DEFAULT_ACL_MODE
        self._acl_principals: list[str] | None = []
        self._acl_revision = 1
        self._marker_context: str | None = DEFAULT_MARKER_CONTEXT
        self._operation: IngestionOperation | None = IngestionOperation.SAVE

    def tenant_id(self, value: str | None) -> "IngestionRequestBuilder":
        """テナント ID を設定する。

        Parameters
        ----------
        value : str | None
            テナント ID。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._tenant_id = value
        return self

    def source_ref(self, value: str | None) -> "IngestionRequestBuilder":
        """取り込み元の参照を設定する。

        Parameters
        ----------
        value : str | None
            取り込み元の参照。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._source_ref = value
        return self

    def display_name(self, value: str | None) -> "IngestionRequestBuilder":
        """表示名を設定する。

        Parameters
        ----------
        value : str | None
            表示名。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._display_name = value
        return self

    def normalized_body(self, value: str | None) -> "IngestionRequestBuilder":
        """本文を設定する。

        Parameters
        ----------
        value : str | None
            正規化済みの本文。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._normalized_body = value
        return self

    def classification(self, value: str | None) -> "IngestionRequestBuilder":
        """分類を設定する。

        Parameters
        ----------
        value : str | None
            分類。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._classification = value
        return self

    def classification_rank(self, value: int) -> "IngestionRequestBuilder":
        """分類ランクを設定する。

        Parameters
        ----------
        value : int
            分類ランク。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._classification_rank = value
        return self

    def acl_mode(self, value: str | None) -> "IngestionRequestBuilder":
        """ACL モードを設定する。

        Parameters
        ----------
        value : str | None
            ACL モード。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._acl_mode = value
        return self

    def acl_principals(self, value: list[str] | None) -> "IngestionRequestBuilder":
        """ACL のプリンシパルを設定する。

        Parameters
        ----------
        value : list[str] | None
            プリンシパルの一覧。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._acl_principals = value
        return self

    def acl_revision(self, value: int) -> "IngestionRequestBuilder":
        """ACL のリビジョンを設定する。

        Parameters
        ----------
        value : int
            ACL のリビジョン。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._acl_revision = value
        return self

    def deterministic_marker_context(
        self, value: str | None
    ) -> "IngestionRequestBuilder":
        """決定的マーカーの文脈を設定する。

        Parameters
        ----------
        value : str | None
            マーカーの文脈。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._marker_context = value
        return self

    def operation(self, value: IngestionOperation | None) -> "IngestionRequestBuilder":
        """操作を設定する。

        Parameters
        ----------
        value : IngestionOperation | None
            取り込みの操作。

        Returns
        -------
        IngestionRequestBuilder
            自分自身。
        """
        self._operation = value
        return self

    def build(self) -> IngestionRequest:
        """要求を作る。

        Returns
        -------
        IngestionRequest
            整えた要求。
        """
        return IngestionRequest(
            self._tenant_id,
            self._source_ref,
            self._display_name,
            self._normalized_body,
            self._classification,
            self._classification_rank,
            self._acl_mode,
            self._acl_principals,
            self._acl_revision,
            self._marker_context,
            self._operation,
        )
