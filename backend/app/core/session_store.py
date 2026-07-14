import json
import secrets

import redis.asyncio as redis

SESSION_COOKIE_NAME = "session_id"
SESSION_TTL_SECONDS = 7200

_SESSION_KEY_PREFIX = "session:"


def _session_key(session_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}{session_id}"


async def create_session(
    login_id: str, tenant_id: str, redis_client: redis.Redis
) -> str:
    """セッションを作成し、Redisに保存してセッションIDを返す。

    Args:
        login_id: 認証済みユーザーのログインID。
        tenant_id: 認証済みユーザーのテナントID。
        redis_client: Redis非同期クライアント。

    Returns:
        発行したセッションID。
    """
    session_id = secrets.token_urlsafe(32)
    payload = json.dumps({"login_id": login_id, "tenant_id": tenant_id})
    await redis_client.set(_session_key(session_id), payload, ex=SESSION_TTL_SECONDS)
    return session_id


async def get_session(
    session_id: str, redis_client: redis.Redis
) -> dict[str, str] | None:
    """セッションIDに対応する認証情報をRedisから取得する。

    Args:
        session_id: Cookieから取得したセッションID。
        redis_client: Redis非同期クライアント。

    Returns:
        `login_id`・`tenant_id`を含む辞書。セッションが存在しない、または保存データが
        壊れている場合は`None`（呼び出し元でbearerフォールバックに回すため、例外は
        送出しない）。
    """
    stored = await redis_client.get(_session_key(session_id))
    if stored is None:
        return None
    try:
        payload = json.loads(stored)
    except json.JSONDecodeError:
        return None
    if (
        not isinstance(payload, dict)
        or "login_id" not in payload
        or "tenant_id" not in payload
    ):
        return None
    return payload


async def delete_session(session_id: str, redis_client: redis.Redis) -> None:
    """セッションをRedisから削除する。

    Args:
        session_id: 削除対象のセッションID。
        redis_client: Redis非同期クライアント。
    """
    await redis_client.delete(_session_key(session_id))


async def touch_session(session_id: str, redis_client: redis.Redis) -> None:
    """セッションのTTLを延長する。

    Args:
        session_id: 延長対象のセッションID。
        redis_client: Redis非同期クライアント。
    """
    await redis_client.expire(_session_key(session_id), SESSION_TTL_SECONDS)
