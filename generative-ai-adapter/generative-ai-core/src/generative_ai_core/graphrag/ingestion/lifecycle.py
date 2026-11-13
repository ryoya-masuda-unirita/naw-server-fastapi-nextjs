"""取り込み元の置き換え・削除（ソースのライフサイクル。移植元 SourceLifecycle*）。"""

from dataclasses import dataclass
from enum import StrEnum

from generative_ai_core.failure import sanitize

_DEFAULT_FAILURE_CODE = "LIFECYCLE_FAILED"
_CONTROL_CHARACTER_LIMIT = 0x20
_UNSAFE_HASH_TOKENS = ("jdbc:", "password", "secret", "{", "/", "\\")
_SUMMARIES = {
    "LIFECYCLE_TARGET_REQUIRED": "Lifecycle target is incomplete.",
    "LIFECYCLE_AMBIGUOUS_SOURCE_REF": (
        "Source reference cannot authorize destructive lifecycle operation."
    ),
    "LIFECYCLE_PATH_ONLY_SOURCE_REF": (
        "Source reference cannot authorize destructive lifecycle operation."
    ),
    "LIFECYCLE_SOURCE_NOT_CURRENT": "Lifecycle source is not current.",
    "LIFECYCLE_STALE_VERSION": "Lifecycle source version is stale.",
    "LIFECYCLE_CONTENT_HASH_REQUIRED": "Replacement content hash is required.",
    "LIFECYCLE_CONTENT_HASH_UNSAFE": "Replacement content hash is invalid.",
    "LIFECYCLE_CONTENT_HASH_COLLISION": "Replacement content hash is not unique.",
    "LIFECYCLE_CONTENT_HASH_UNCHANGED": "Replacement content hash is unchanged.",
    "LIFECYCLE_DELETE_REASON_REQUIRED": "Deletion reason is required.",
    "LIFECYCLE_UNSUPPORTED": "Lifecycle operation is unsupported.",
}
_DEFAULT_SUMMARY = "Source lifecycle failed closed."


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


def _has_control_character(value: str) -> bool:
    """制御文字（0x20 未満）を含むか。

    Parameters
    ----------
    value : str
        文字列。

    Returns
    -------
    bool
        含めば True。
    """
    return any(ord(ch) < _CONTROL_CHARACTER_LIMIT for ch in value)


def unsafe_lifecycle_text(value: str) -> bool:
    """削除理由として安全でない文字列か（制御文字・接続文字列・秘密語・`{`）。

    Parameters
    ----------
    value : str
        削除理由。

    Returns
    -------
    bool
        安全でなければ True。
    """
    lower = value.lower()
    return _has_control_character(value) or any(
        token in lower for token in ("jdbc:", "password", "secret", "{")
    )


class SourceLifecycleOperation(StrEnum):
    """ライフサイクルの操作。"""

    REPLACE = "REPLACE"
    DELETE = "DELETE"


@dataclass(frozen=True)
class SourceLifecycleRequest:
    """取り込み元の置き換え・削除の要求。"""

    operation: SourceLifecycleOperation | None
    tenant_id: str | None
    source_ref: str | None
    expected_source_version: str | None
    new_content_hash: str | None
    deletion_reason: str | None

    def __post_init__(self) -> None:
        """文字列項目を整える（空白だけは None）。"""
        for name in (
            "tenant_id",
            "source_ref",
            "expected_source_version",
            "new_content_hash",
            "deletion_reason",
        ):
            object.__setattr__(self, name, _trim_to_none(getattr(self, name)))

    @classmethod
    def replace(
        cls,
        tenant_id: str | None,
        source_ref: str | None,
        expected_source_version: str | None,
        new_content_hash: str | None,
    ) -> "SourceLifecycleRequest":
        """置き換えの要求を作る。

        Parameters
        ----------
        tenant_id : str | None
            テナント ID。
        source_ref : str | None
            取り込み元の参照。
        expected_source_version : str | None
            期待する現行バージョン ID。
        new_content_hash : str | None
            新しい内容のハッシュ。

        Returns
        -------
        SourceLifecycleRequest
            置き換えの要求。
        """
        return cls(
            SourceLifecycleOperation.REPLACE,
            tenant_id,
            source_ref,
            expected_source_version,
            new_content_hash,
            None,
        )

    @classmethod
    def delete(
        cls,
        tenant_id: str | None,
        source_ref: str | None,
        expected_source_version: str | None,
        deletion_reason: str | None,
    ) -> "SourceLifecycleRequest":
        """削除の要求を作る。

        Parameters
        ----------
        tenant_id : str | None
            テナント ID。
        source_ref : str | None
            取り込み元の参照。
        expected_source_version : str | None
            期待する現行バージョン ID。
        deletion_reason : str | None
            削除の理由。

        Returns
        -------
        SourceLifecycleRequest
            削除の要求。
        """
        return cls(
            SourceLifecycleOperation.DELETE,
            tenant_id,
            source_ref,
            expected_source_version,
            None,
            deletion_reason,
        )

    def source_ref_looks_path_only(self) -> bool:
        """取り込み元の参照がパスだけに見えるか。

        Returns
        -------
        bool
            `/` か `\\` を含めば True。
        """
        return self.source_ref is not None and (
            "/" in self.source_ref or "\\" in self.source_ref
        )

    def source_ref_looks_ambiguous(self) -> bool:
        """取り込み元の参照が曖昧に見えるか。

        Returns
        -------
        bool
            `:` を含めば True。
        """
        return self.source_ref is not None and ":" in self.source_ref

    def new_content_hash_looks_unsafe(self) -> bool:
        """新しい内容のハッシュが安全でなく見えるか。

        Returns
        -------
        bool
            制御文字・接続文字列・秘密語・`{`・パス区切りを含めば True。
        """
        if self.new_content_hash is None:
            return False
        lower = self.new_content_hash.lower()
        return _has_control_character(self.new_content_hash) or any(
            token in lower for token in _UNSAFE_HASH_TOKENS
        )


@dataclass(frozen=True)
class SourceLifecycleResult:
    """置き換え・削除の結果。失敗時は ID・件数を持たない。"""

    succeeded: bool
    operation: str | None
    failure_code: str | None
    failure_summary: str | None
    previous_version_id: str | None
    current_version_id: str | None
    replacement_registered: bool
    affected_versions: int

    def __post_init__(self) -> None:
        """失敗時に失敗コード・伏せ字の要約を補い、ID・件数を消す。"""
        set_ = object.__setattr__
        set_(self, "operation", self.operation or "unknown")
        if self.succeeded:
            set_(self, "failure_code", None)
            set_(self, "failure_summary", None)
            return
        code = (self.failure_code or "").strip() or _DEFAULT_FAILURE_CODE
        summary = (self.failure_summary or "").strip() or _DEFAULT_SUMMARY
        set_(self, "failure_code", code)
        set_(self, "failure_summary", sanitize(summary))
        set_(self, "previous_version_id", None)
        set_(self, "current_version_id", None)
        set_(self, "replacement_registered", False)
        set_(self, "affected_versions", 0)

    @classmethod
    def replace_succeeded(
        cls, previous_version_id: str, current_version_id: str
    ) -> "SourceLifecycleResult":
        """置き換え成功の結果を作る。

        Parameters
        ----------
        previous_version_id : str
            置き換え前のバージョン ID。
        current_version_id : str
            置き換え後のバージョン ID。

        Returns
        -------
        SourceLifecycleResult
            成功の結果。
        """
        return cls(
            True,
            "replace",
            None,
            None,
            previous_version_id,
            current_version_id,
            True,
            1,
        )

    @classmethod
    def delete_succeeded(cls, previous_version_id: str) -> "SourceLifecycleResult":
        """削除成功の結果を作る。

        Parameters
        ----------
        previous_version_id : str
            削除したバージョン ID。

        Returns
        -------
        SourceLifecycleResult
            成功の結果。
        """
        return cls(True, "delete", None, None, previous_version_id, None, False, 1)

    @classmethod
    def failure(
        cls, request: SourceLifecycleRequest | None, code: str | None
    ) -> "SourceLifecycleResult":
        """失敗の結果を作る。

        Parameters
        ----------
        request : SourceLifecycleRequest | None
            要求。操作名の取得に使う。
        code : str | None
            失敗コード。

        Returns
        -------
        SourceLifecycleResult
            失敗の結果。
        """
        operation = (
            "unknown"
            if request is None or request.operation is None
            else request.operation.name.lower()
        )
        normalized = (code or "").strip() or _DEFAULT_FAILURE_CODE
        return cls(
            False,
            operation,
            code,
            _SUMMARIES.get(normalized, _DEFAULT_SUMMARY),
            None,
            None,
            False,
            0,
        )
