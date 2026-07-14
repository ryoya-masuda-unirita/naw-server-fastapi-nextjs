import redis.asyncio as redis

from app.core.config import get_redis_settings

_redis_client: redis.Redis | None = None


def get_redis_client_instance() -> redis.Redis:
    """プロセス内で使い回すRedis非同期クライアントを取得する。

    Returns:
        Redis非同期クライアント（初回呼び出し時に生成し、以降は同じインスタンスを返す）。
    """
    global _redis_client
    if _redis_client is None:
        settings = get_redis_settings()
        _redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


async def get_redis_client() -> redis.Redis:
    """FastAPIの`Depends`で使うRedisクライアント取得用の依存関数。

    Returns:
        Redis非同期クライアント。
    """
    return get_redis_client_instance()
