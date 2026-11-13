"""GraphRAG ランタイムの準備（bootstrap）の入出力の型（移植元 graphrag.bootstrap の各 record・例外）。"""

import re
from dataclasses import dataclass, field
from enum import StrEnum

from generative_ai_core.failure import sanitize
from generative_ai_core.graphrag.bootstrap.resource_set import (
    GraphRagRuntimeResourceSet,
)

DEFAULT_PROVIDER = "PostgreSQL"
SANITIZED_TARGET = "sanitized-target"
_SQL_REDACTIONS = (
    re.compile(r"(?i)create\s+extension[^\n;]*"),
    re.compile(r"(?i)select\s+[^\n;]*"),
    re.compile(r"(?i)insert\s+into\s+[^\n;]*"),
    re.compile(r"(?i)update\s+[^\n;]*"),
    re.compile(r"(?i)delete\s+from\s+[^\n;]*"),
)


class GraphRagRuntimeBootstrapException(RuntimeError):
    """ランタイムの準備に失敗した（移植元 GraphRagRuntimeBootstrapException）。"""

    def __init__(
        self,
        failure_code: str | None,
        message: str | None,
        cause: BaseException | None = None,
    ) -> None:
        """失敗コードとメッセージから作る。

        Parameters
        ----------
        failure_code : str | None
            失敗コード。空なら `unknown_sanitized`。
        message : str | None
            メッセージ。
        cause : BaseException | None
            原因の例外。
        """
        super().__init__(message)
        self.failure_code = (
            failure_code
            if failure_code and failure_code.strip()
            else "unknown_sanitized"
        )
        self.__cause__ = cause

    @classmethod
    def missing_extension(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """拡張機能がないときの失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗コード `missing_extension` の例外。
        """
        return cls("missing_extension", message)

    @classmethod
    def insufficient_privilege(
        cls, message: str
    ) -> "GraphRagRuntimeBootstrapException":
        """権限が足りないときの失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗コード `insufficient_privilege` の例外。
        """
        return cls("insufficient_privilege", message)

    @classmethod
    def incompatible_schema(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """スキーマが合わないときの失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗コード `incompatible_schema` の例外。
        """
        return cls("incompatible_schema", message)

    @classmethod
    def age_graph_unavailable(cls, message: str) -> "GraphRagRuntimeBootstrapException":
        """AGE のグラフが使えないときの失敗を作る。

        Parameters
        ----------
        message : str
            メッセージ。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            失敗コード `age_graph_unavailable` の例外。
        """
        return cls("age_graph_unavailable", message)

    @classmethod
    def from_sql(
        cls, fallback_code: str, exception: BaseException | None
    ) -> "GraphRagRuntimeBootstrapException":
        """SQL の例外から作る。

        Parameters
        ----------
        fallback_code : str
            失敗コード。
        exception : BaseException | None
            元の例外。

        Returns
        -------
        GraphRagRuntimeBootstrapException
            例外。
        """
        message = "GraphRAG runtime failure." if exception is None else str(exception)
        return cls(fallback_code, message, exception)


class GraphRagRuntimeBootstrapMode(StrEnum):
    """準備のモード。"""

    CREATE_IF_MISSING = "CREATE_IF_MISSING"
    VERIFY_ONLY = "VERIFY_ONLY"


@dataclass(frozen=True)
class GraphRagRuntimeTargetDescriptor:
    """準備先の説明（秘密情報を含まない）。"""

    provider: str | None
    sanitized_descriptor: str | None

    def __post_init__(self) -> None:
        """プロバイダー名を整え、説明を伏せ字にする。"""
        provider = (
            self.provider.strip()
            if self.provider and self.provider.strip()
            else DEFAULT_PROVIDER
        )
        descriptor = (
            self.sanitized_descriptor
            if self.sanitized_descriptor and self.sanitized_descriptor.strip()
            else f"{self.provider}:{SANITIZED_TARGET}"
        )
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "sanitized_descriptor", sanitize(descriptor))

    @classmethod
    def sanitized(
        cls, provider: str | None, sanitized_descriptor: str | None
    ) -> "GraphRagRuntimeTargetDescriptor":
        """準備先の説明を作る。

        Parameters
        ----------
        provider : str | None
            プロバイダー名。
        sanitized_descriptor : str | None
            説明。

        Returns
        -------
        GraphRagRuntimeTargetDescriptor
            準備先の説明。
        """
        return cls(provider, sanitized_descriptor)


@dataclass(frozen=True)
class GraphRagRuntimeBootstrapRequest:
    """準備の要求。省略した項目は既定で補う。"""

    target: GraphRagRuntimeTargetDescriptor | None
    mode: GraphRagRuntimeBootstrapMode | None
    graph_name: str | None
    resource_set: GraphRagRuntimeResourceSet | None

    def __post_init__(self) -> None:
        """準備先・モード・グラフ名・リソース一式の既定値を補う。"""
        graph_name = GraphRagRuntimeResourceSet.normalize_graph_name(self.graph_name)
        object.__setattr__(
            self,
            "target",
            self.target
            or GraphRagRuntimeTargetDescriptor.sanitized(
                DEFAULT_PROVIDER, SANITIZED_TARGET
            ),
        )
        object.__setattr__(
            self, "mode", self.mode or GraphRagRuntimeBootstrapMode.VERIFY_ONLY
        )
        object.__setattr__(self, "graph_name", graph_name)
        object.__setattr__(
            self,
            "resource_set",
            self.resource_set or GraphRagRuntimeResourceSet.canonical(graph_name),
        )

    @classmethod
    def create_if_missing(
        cls, target: GraphRagRuntimeTargetDescriptor | None, graph_name: str | None
    ) -> "GraphRagRuntimeBootstrapRequest":
        """足りなければ作る要求を作る。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor | None
            準備先。
        graph_name : str | None
            AGE のグラフ名。

        Returns
        -------
        GraphRagRuntimeBootstrapRequest
            要求。
        """
        return cls(
            target, GraphRagRuntimeBootstrapMode.CREATE_IF_MISSING, graph_name, None
        )

    @classmethod
    def verify_only(
        cls, target: GraphRagRuntimeTargetDescriptor | None, graph_name: str | None
    ) -> "GraphRagRuntimeBootstrapRequest":
        """確認だけする要求を作る。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor | None
            準備先。
        graph_name : str | None
            AGE のグラフ名。

        Returns
        -------
        GraphRagRuntimeBootstrapRequest
            要求。
        """
        return cls(target, GraphRagRuntimeBootstrapMode.VERIFY_ONLY, graph_name, None)


@dataclass(frozen=True)
class GraphRagRuntimeGatewayResult:
    """ゲートウェイが確認・作成したリソース。"""

    resources_checked: tuple[str, ...] = field(default_factory=tuple)
    created_resources: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        """一覧をタプルに揃える。"""
        object.__setattr__(
            self, "resources_checked", tuple(self.resources_checked or ())
        )
        object.__setattr__(
            self, "created_resources", tuple(self.created_resources or ())
        )

    @classmethod
    def ready(
        cls,
        resources_checked: list[str] | tuple[str, ...],
        created_resources: list[str] | tuple[str, ...],
    ) -> "GraphRagRuntimeGatewayResult":
        """準備完了の結果を作る。

        Parameters
        ----------
        resources_checked : list[str] | tuple[str, ...]
            確認したリソース。
        created_resources : list[str] | tuple[str, ...]
            作成したリソース。

        Returns
        -------
        GraphRagRuntimeGatewayResult
            結果。
        """
        return cls(tuple(resources_checked), tuple(created_resources))


def _sanitize_evidence(evidence: str | None) -> str:
    """証跡の文字列を伏せ字にし、SQL とカタログ名を隠す。

    Parameters
    ----------
    evidence : str | None
        証跡。

    Returns
    -------
    str
        伏せ字にした証跡。
    """
    sanitized = sanitize(
        evidence if evidence and evidence.strip() else "GraphRAG runtime evidence."
    )
    for pattern in _SQL_REDACTIONS:
        sanitized = pattern.sub("[SQL_REDACTED]", sanitized)
    return sanitized.replace("ag_catalog", "[DB_CATALOG]")


@dataclass(frozen=True)
class GraphRagRuntimeReadinessResult:
    """ランタイムの準備の結果。"""

    ready: bool
    status: str | None
    failure_code: str | None
    target: GraphRagRuntimeTargetDescriptor | None
    resources_checked: tuple[str, ...]
    created_resources: tuple[str, ...]
    sanitized_evidence: str | None
    forbidden_content_scan_status: str | None

    def __post_init__(self) -> None:
        """既定値を補い、証跡を伏せ字にする。"""
        set_ = object.__setattr__
        status = (
            self.status.strip()
            if self.status and self.status.strip()
            else ("ready" if self.ready else "failed")
        )
        set_(self, "status", status)
        set_(
            self,
            "target",
            self.target
            or GraphRagRuntimeTargetDescriptor.sanitized(
                DEFAULT_PROVIDER, SANITIZED_TARGET
            ),
        )
        set_(self, "resources_checked", tuple(self.resources_checked or ()))
        set_(self, "created_resources", tuple(self.created_resources or ()))
        set_(self, "sanitized_evidence", _sanitize_evidence(self.sanitized_evidence))
        scan = self.forbidden_content_scan_status
        set_(
            self,
            "forbidden_content_scan_status",
            scan.strip() if scan and scan.strip() else "PASS",
        )

    @classmethod
    def make_ready(
        cls,
        target: GraphRagRuntimeTargetDescriptor,
        resources_checked: list[str] | tuple[str, ...],
        created_resources: list[str] | tuple[str, ...],
    ) -> "GraphRagRuntimeReadinessResult":
        """準備完了の結果を作る（移植元の `ready(...)`。`ready` は項目名と重なるため改名）。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor
            準備先。
        resources_checked : list[str] | tuple[str, ...]
            確認したリソース。
        created_resources : list[str] | tuple[str, ...]
            作成したリソース。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            準備完了の結果。
        """
        return cls(
            True,
            "ready",
            None,
            target,
            tuple(resources_checked),
            tuple(created_resources),
            f"GraphRAG runtime ready for {target.sanitized_descriptor}",
            "PASS",
        )

    @classmethod
    def failed(
        cls,
        target: GraphRagRuntimeTargetDescriptor,
        failure_code: str | None,
        resources_checked: list[str] | tuple[str, ...],
        evidence: str | None,
    ) -> "GraphRagRuntimeReadinessResult":
        """準備失敗の結果を作る。

        Parameters
        ----------
        target : GraphRagRuntimeTargetDescriptor
            準備先。
        failure_code : str | None
            失敗コード。
        resources_checked : list[str] | tuple[str, ...]
            確認したリソース。
        evidence : str | None
            証跡。

        Returns
        -------
        GraphRagRuntimeReadinessResult
            準備失敗の結果。
        """
        return cls(
            False,
            "failed",
            failure_code,
            target,
            tuple(resources_checked),
            (),
            f"GraphRAG runtime failed: {failure_code}. {evidence}",
            "PASS",
        )
