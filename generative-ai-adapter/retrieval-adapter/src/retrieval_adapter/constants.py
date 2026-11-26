"""プロパティ ID（移植元 RetrievalPropertyIds と properties.xml）。

番号は生成AIアダプタと別（検索アダプタ専用）。たとえば 42 は、生成AIアダプタでは推論の出力先、
検索アダプタでは VDB のパスワード。
"""

from generative_ai_core.property_ids import (
    EMBEDDING_VENDOR_NAMES,
    PropertyIdsBase,
)
from generative_ai_core.property_ids import (
    VDB_VENDOR_NAMES as CORE_VDB_VENDOR_NAMES,
)


class RetrievalPropertyIds(PropertyIdsBase):
    """Waha! の接続プロパティの ID。"""

    URL = 0
    API_KEY = 1
    MODEL_NAME = 2
    TENANT_ID = 3
    USE_PROXY = 4
    PROXY_HOST = 5
    PROXY_PORT = 6
    USE_PROXY_CRED = 7
    PROXY_ID = 8
    PROXY_PASS = 9
    INSECURE_SSL = 10
    OUTPUT_DIR = 11
    VDB_URL = 12
    VDB_API_KEY = 13
    VDB_INDEX_NAME = 14
    SEARCH_COUNT = 15
    VENDOR = 30
    VDB_VENDOR = 31
    IMAGE_EXPLANATION_MODE = 32
    VDB_USER_NAME = 41
    VDB_PASSWORD = 42
    VDB_DATABASE_NAME = 43
    VDB_TABLE_NAME = 44
    GRAPH_RAG_ENABLED = 45
    AGE_GRAPH_NAME = 46
    HYBRID_RETRIEVAL_ENABLED = 47
    EMBEDDING_DIMENSIONS = 51
    TEXT_DATA_JSON_FILE_PATH = 52
    PROVIDER_LLM_RERANK_ENABLED = 53
    PROVIDER_LLM_RERANK_PROVIDER = 54
    PROVIDER_LLM_RERANK_URL = 55
    PROVIDER_LLM_RERANK_API_KEY = 56
    PROVIDER_LLM_RERANK_MODEL = 57
    PROVIDER_LLM_RERANK_TENANT_ID = 58
    PROVIDER_LLM_RERANK_TIMEOUT_SECONDS = 59


# 出力モード（`connect` の out_mode）
OUT_MODE_LEGACY_TSV = 0
OUT_MODE_RAG_CONTEXT_JSON_V1 = 1

# プロパティ 30・31 のベンダー名の表は、埋め込みアダプタと共通（core）
VENDOR_NAMES = EMBEDDING_VENDOR_NAMES
VDB_VENDOR_NAMES = CORE_VDB_VENDOR_NAMES

# プロパティ 54（リランクのプロバイダー）の ID → ベンダー名
RERANK_VENDOR_NAMES = {
    "0": "OpenAI",
    "1": "AzureOpenAI",
    "5": "SecuAiGent",
}
