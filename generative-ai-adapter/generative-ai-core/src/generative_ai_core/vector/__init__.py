"""ベクトルDB の接続先と PostgreSQL まわりの共通部分（移植元 jp.co.unirita.ai.core.vector のうち検索が使う部分）。

ベクトルの保存・更新・削除（移植元の `CoreVectorDbRuntime` など）は embedding-adapter の
Issue で移植する。
"""

from generative_ai_core.vector.target import (
    CoreVectorDbTarget,
    Endpoint,
    parse_endpoint,
)

__all__ = ["CoreVectorDbTarget", "Endpoint", "parse_endpoint"]
