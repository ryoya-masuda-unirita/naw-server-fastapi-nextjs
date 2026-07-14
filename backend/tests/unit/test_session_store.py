import fakeredis.aioredis
import pytest

from app.core.session_store import (
    SESSION_TTL_SECONDS,
    create_session,
    delete_session,
    get_session,
    touch_session,
)


@pytest.fixture
async def fake_redis():
    """fakeredis によるインメモリ Redis（テスト用）"""
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield redis
    await redis.aclose()


class TestCreateAndGetSession:
    async def test_creates_session_retrievable_by_id(self, fake_redis):
        """作成したセッションをセッションIDで取得できること"""
        session_id = await create_session("testuser", "test-tenant", fake_redis)

        data = await get_session(session_id, fake_redis)

        assert data == {"login_id": "testuser", "tenant_id": "test-tenant"}

    async def test_sets_ttl_on_creation(self, fake_redis):
        """作成したセッションにTTLが設定されること"""
        session_id = await create_session("testuser", "test-tenant", fake_redis)

        ttl = await fake_redis.ttl(f"session:{session_id}")

        assert 0 < ttl <= SESSION_TTL_SECONDS

    async def test_returns_none_for_nonexistent_session(self, fake_redis):
        """存在しないセッションIDの場合はNoneを返すこと"""
        data = await get_session("nonexistent-session-id", fake_redis)

        assert data is None

    async def test_returns_none_for_malformed_json(self, fake_redis):
        """Redisの値が不正なJSONの場合は例外を送出せずNoneを返すこと"""
        await fake_redis.set("session:broken", "not-valid-json{")

        data = await get_session("broken", fake_redis)

        assert data is None

    async def test_returns_none_when_required_keys_missing(self, fake_redis):
        """Redisの値にlogin_id・tenant_idが欠けている場合はNoneを返すこと"""
        await fake_redis.set("session:incomplete", '{"login_id": "testuser"}')

        data = await get_session("incomplete", fake_redis)

        assert data is None


class TestDeleteSession:
    async def test_removes_session(self, fake_redis):
        """セッションを削除できること"""
        session_id = await create_session("testuser", "test-tenant", fake_redis)

        await delete_session(session_id, fake_redis)

        assert await get_session(session_id, fake_redis) is None


class TestTouchSession:
    async def test_extends_ttl(self, fake_redis):
        """TTLを延長できること"""
        session_id = await create_session("testuser", "test-tenant", fake_redis)
        await fake_redis.expire(f"session:{session_id}", 10)

        await touch_session(session_id, fake_redis)

        ttl = await fake_redis.ttl(f"session:{session_id}")
        assert ttl > 10
