"""GraphRAG ランタイムの準備（移植元 jp.co.unirita.ai.core.graphrag.bootstrap）。

PostgreSQL に pgvector・PGroonga・Apache AGE の拡張と、`graphrag_s01`・`graphrag_s02`
スキーマ、AGE のグラフがあるかを確認し、足りなければ作る。マイグレーションの SQL は
`migrations/` に移植元と同じ内容で置いている（検索アダプタ #299 も同じ準備を使う）。
"""

from generative_ai_core.graphrag.bootstrap.gateway import (
    GraphRagRuntimeBootstrapper,
    GraphRagRuntimeBootstrapService,
    GraphRagRuntimeResourceGateway,
    JdbcGraphRagRuntimeResourceGateway,
    map_sql_exception,
    ready_noop,
)
from generative_ai_core.graphrag.bootstrap.models import (
    GraphRagRuntimeBootstrapException,
    GraphRagRuntimeBootstrapMode,
    GraphRagRuntimeBootstrapRequest,
    GraphRagRuntimeGatewayResult,
    GraphRagRuntimeReadinessResult,
    GraphRagRuntimeTargetDescriptor,
)
from generative_ai_core.graphrag.bootstrap.resource_set import (
    DEFAULT_GRAPH_NAME,
    FOUNDATION_SCHEMA,
    SCHEMA,
    GraphRagRuntimeResourceSet,
)

__all__ = [
    "DEFAULT_GRAPH_NAME",
    "FOUNDATION_SCHEMA",
    "SCHEMA",
    "GraphRagRuntimeBootstrapException",
    "GraphRagRuntimeBootstrapMode",
    "GraphRagRuntimeBootstrapRequest",
    "GraphRagRuntimeBootstrapService",
    "GraphRagRuntimeBootstrapper",
    "GraphRagRuntimeGatewayResult",
    "GraphRagRuntimeReadinessResult",
    "GraphRagRuntimeResourceGateway",
    "GraphRagRuntimeResourceSet",
    "GraphRagRuntimeTargetDescriptor",
    "JdbcGraphRagRuntimeResourceGateway",
    "map_sql_exception",
    "ready_noop",
]
