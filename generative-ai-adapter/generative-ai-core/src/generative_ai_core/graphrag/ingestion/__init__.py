"""Graph Candidate の取り込み（移植元 jp.co.unirita.ai.core.graphrag.ingestion）。

JDBC の `Connection` は psycopg 3 の接続に置き換えている。接続は呼び出し側が作って
`JdbcIngestionPersistenceAdapter` に渡す（テストでは偽の接続を渡す）。
"""

from generative_ai_core.graphrag.ingestion.admission import (
    IngestionAdmissionGate,
    IngestionDeterministicExtractor,
)
from generative_ai_core.graphrag.ingestion.business_graph import (
    BusinessGraphProjectionCommand,
    BusinessGraphProjectionRow,
    BusinessGraphProjectionService,
    JdbcBusinessGraphProjectionService,
    NoopBusinessGraphProjectionService,
)
from generative_ai_core.graphrag.ingestion.candidates import (
    IngestionEdgeCandidate,
    IngestionEntityCandidate,
    IngestionIdentifier,
    normalize_identifier,
    stable_id,
)
from generative_ai_core.graphrag.ingestion.extraction import IngestionExtraction
from generative_ai_core.graphrag.ingestion.graph_setting import (
    DEFAULT_GRAPH_NAME,
    IngestionGraphSetting,
    normalize_graph_name,
)
from generative_ai_core.graphrag.ingestion.jdbc_persistence import (
    JdbcIngestionPersistenceAdapter,
)
from generative_ai_core.graphrag.ingestion.lifecycle import (
    SourceLifecycleOperation,
    SourceLifecycleRequest,
    SourceLifecycleResult,
)
from generative_ai_core.graphrag.ingestion.persistence import (
    BaseIngestionPersistenceAdapter,
    IngestionPersistenceAdapter,
    InMemoryIngestionPersistenceAdapter,
)
from generative_ai_core.graphrag.ingestion.reject_classification import (
    IngestionRejectClassification,
)
from generative_ai_core.graphrag.ingestion.request import (
    IngestionOperation,
    IngestionRequest,
    IngestionRequestBuilder,
)
from generative_ai_core.graphrag.ingestion.result import (
    GraphCandidateRepairOutcome,
    IngestionAdmissionDecision,
    IngestionChunkDiffSummary,
    IngestionNonGoalProbe,
    IngestionResult,
    IngestionSchemaReadiness,
)
from generative_ai_core.graphrag.ingestion.runtime import IngestionRuntime

__all__ = [
    "DEFAULT_GRAPH_NAME",
    "BaseIngestionPersistenceAdapter",
    "BusinessGraphProjectionCommand",
    "BusinessGraphProjectionRow",
    "BusinessGraphProjectionService",
    "GraphCandidateRepairOutcome",
    "InMemoryIngestionPersistenceAdapter",
    "IngestionAdmissionDecision",
    "IngestionAdmissionGate",
    "IngestionChunkDiffSummary",
    "IngestionDeterministicExtractor",
    "IngestionEdgeCandidate",
    "IngestionEntityCandidate",
    "IngestionExtraction",
    "IngestionGraphSetting",
    "IngestionIdentifier",
    "IngestionNonGoalProbe",
    "IngestionOperation",
    "IngestionPersistenceAdapter",
    "IngestionRejectClassification",
    "IngestionRequest",
    "IngestionRequestBuilder",
    "IngestionResult",
    "IngestionRuntime",
    "IngestionSchemaReadiness",
    "JdbcBusinessGraphProjectionService",
    "JdbcIngestionPersistenceAdapter",
    "NoopBusinessGraphProjectionService",
    "SourceLifecycleOperation",
    "SourceLifecycleRequest",
    "SourceLifecycleResult",
    "normalize_graph_name",
    "normalize_identifier",
    "stable_id",
]
