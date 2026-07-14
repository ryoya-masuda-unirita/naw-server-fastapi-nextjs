import redis.asyncio as redis

from app.core.config import get_redis_settings

_redis_client: redis.Redis | None = None


def get_redis_client_instance() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_redis_settings()
        _redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


async def get_redis_client() -> redis.Redis:
    return get_redis_client_instance()
