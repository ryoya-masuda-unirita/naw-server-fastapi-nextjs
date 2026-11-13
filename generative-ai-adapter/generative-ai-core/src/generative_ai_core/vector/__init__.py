"""ベクトルDB への保存・更新・削除・検索と Graph 書き込み（移植元 jp.co.unirita.ai.core.vector）。

- PostgreSQL（pgvector + Apache AGE）と Azure AI Search のプロバイダ
- 補償削除（Graph Candidate の拒否時に、vector・AGE・GraphRAG の各層を取り消す）

JDBC は psycopg 3 に置き換えている。接続の作り方は `PgVectorCoreVectorDbProvider` の
`connection_factory` 引数で差し替えられる（テストでは偽の接続を渡す）。

移植元の `CoreVectorDbResult.success(...)`・`failure(...)` は dataclass の属性名と
衝突するため、それぞれ `ok(...)`・`fail(...)` にしている。
"""

from generative_ai_core.vector.azure_search import AzureAiSearchCoreVectorDbProvider
from generative_ai_core.vector.compensating import (
    CommittedRow,
    CommittedRowIds,
    CompensatingDeleteOutcome,
    CompensatingDeleteOwnershipScope,
    CompensatingDeleteRequest,
    CompensatingDeleteService,
    LayerStatus,
    OverallStatus,
    RowOutcome,
    RowStatus,
)
from generative_ai_core.vector.graph import (
    CoreAgeGraphWriteService,
    CoreGraphFailureClassifier,
    ensure_age_session,
    with_age_session,
)
from generative_ai_core.vector.jdbc import (
    Connection,
    ConnectionFactory,
    JdbcTemplate,
    default_connection_factory,
)
from generative_ai_core.vector.model import (
    DEFAULT_GRAPH_NAME,
    CoreGraphChunkWritePayload,
    CoreGraphWriteResult,
    CoreGraphWriteSetting,
    CoreGraphWriteStatus,
    CoreVectorDbOperation,
    CoreVectorDbPayload,
    CoreVectorDbProvider,
    CoreVectorDbRequest,
    CoreVectorDbRequestBuilder,
    CoreVectorDbResult,
    CoreVectorSearchMatch,
    validate_graph_name,
)
from generative_ai_core.vector.pgvector import (
    FILE_UNIQUE_ID_DELETE_RESULT_ID,
    PgVectorCoreVectorDbProvider,
)
from generative_ai_core.vector.runtime import CoreVectorDbRuntime
from generative_ai_core.vector.schema import (
    EMBEDDING_DIMENSIONS,
    PgVectorSchemaInitializer,
)
from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    Endpoint,
    parse_endpoint,
    pgroonga_content_index_name,
    safe_identifier,
)

__all__ = [
    "DEFAULT_GRAPH_NAME",
    "EMBEDDING_DIMENSIONS",
    "FILE_UNIQUE_ID_DELETE_RESULT_ID",
    "AzureAiSearchCoreVectorDbProvider",
    "CommittedRow",
    "CommittedRowIds",
    "CompensatingDeleteOutcome",
    "CompensatingDeleteOwnershipScope",
    "CompensatingDeleteRequest",
    "CompensatingDeleteService",
    "Connection",
    "ConnectionFactory",
    "CoreAgeGraphWriteService",
    "CoreGraphChunkWritePayload",
    "CoreGraphFailureClassifier",
    "CoreGraphWriteResult",
    "CoreGraphWriteSetting",
    "CoreGraphWriteStatus",
    "CoreVectorDbOperation",
    "CoreVectorDbPayload",
    "CoreVectorDbProvider",
    "CoreVectorDbRequest",
    "CoreVectorDbRequestBuilder",
    "CoreVectorDbResult",
    "CoreVectorDbRuntime",
    "CoreVectorDbTarget",
    "CoreVectorSearchMatch",
    "Endpoint",
    "JdbcTemplate",
    "LayerStatus",
    "OverallStatus",
    "PgVectorCoreVectorDbProvider",
    "PgVectorSchemaInitializer",
    "RowOutcome",
    "RowStatus",
    "default_connection_factory",
    "ensure_age_session",
    "parse_endpoint",
    "pgroonga_content_index_name",
    "safe_identifier",
    "validate_graph_name",
    "with_age_session",
]
