"""補償削除のメタデータキー・層・理由コード（移植元 CompensatingDeleteService の定数）。

PgVector プロバイダと補償削除サービスが相互に参照するため、循環を避けて分けている。
"""

# プロバイダが補償削除の層を見分けるメタデータキー
METADATA_COMPENSATING_LAYER = "compensatingDeleteLayer"
LAYER_VECTOR = "vector"
LAYER_GRAPH_RAG = "graphrag"

REASON_ALREADY_ABSENT = "already_absent"
REASON_GRAPH_NODE_UNWRITTEN = "graph_node_unwritten"
REASON_GRAPH_WRITE_DISABLED = "graph_write_disabled"
REASON_EMPTY_METADATA = "empty_metadata"
REASON_CROSS_SCOPE_BLOCKED = "cross_scope_blocked"
