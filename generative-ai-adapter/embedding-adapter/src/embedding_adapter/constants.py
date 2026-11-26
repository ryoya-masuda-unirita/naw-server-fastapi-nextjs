"""プロパティ ID・出力モード（移植元 EmbeddingPropertyIds・properties.xml の outMode）。"""

from generative_ai_core.property_ids import (
    EMBEDDING_VENDOR_NAMES,
    VDB_VENDOR_NAMES,
    PropertyIdsBase,
)

# 出力モード（properties.xml の outMode。Waha! の connect に渡る）
OUTPUT_TYPE_TEXT = 0
OUTPUT_TYPE_VDB_ADD = 1
OUTPUT_TYPE_VDB_DELETE = 2
OUTPUT_TYPE_VDB_NEW = 3


class PropertyIds(PropertyIdsBase):
    """Waha! の接続プロパティの ID（移植元 App#setProperty の case 番号・properties.xml）。

    移植元の `EmbeddingPropertyIds` にある定数に加え、App の case 文だけにある番号
    （Proxy・VDB API Key など）も名前を付けて持つ。エミュレーターの設定ファイルでは
    この名前でプロパティを指定する。
    """

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
    TIMEOUT_SECONDS = 23
    VENDOR = 30
    VDB_VENDOR = 31
    IMAGE_EXPLANATION_MODE = 32
    VDB_USER_NAME = 41
    VDB_PASSWORD = 42
    VDB_DATABASE_NAME = 43
    VDB_TABLE_NAME = 44
    GRAPH_WRITE_ENABLED = 45
    AGE_GRAPH_NAME = 46
    GRAPH_CANDIDATE_LLM_VENDOR = 47
    GRAPH_CANDIDATE_LLM_URL = 48
    GRAPH_CANDIDATE_LLM_API_KEY = 49
    GRAPH_CANDIDATE_LLM_MODEL_NAME = 50
    EMBEDDING_DIMENSIONS = 51
    TEXT_DATA_JSON_FILE_PATH = 52
    REJECT_AUDIT_OUTPUT_DIR = 53


# ベンダー ID → 名前の表は、検索アダプタと共通（core）
EMBEDDING_VENDOR_MAP = EMBEDDING_VENDOR_NAMES
VDB_VENDOR_MAP = VDB_VENDOR_NAMES
