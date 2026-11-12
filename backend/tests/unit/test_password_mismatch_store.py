import time
from unittest.mock import patch
from uuid import uuid4

from app.core import password_mismatch_store

TENANT_ID = "test-tenant"
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
LOCKOUT_SECONDS = LOCKOUT_MINUTES * 60
TIME_PATH = "app.core.password_mismatch_store.time.time"


async def _record(user_id, redis_client, tenant_id: str = TENANT_ID) -> bool:
    return await password_mismatch_store.record_failure_and_check_lockout(
        user_id, tenant_id, MAX_ATTEMPTS, LOCKOUT_MINUTES, redis_client
    )


async def _is_locked(user_id, redis_client, tenant_id: str = TENANT_ID) -> bool:
    return await password_mismatch_store.is_locked_out(
        user_id, tenant_id, MAX_ATTEMPTS, LOCKOUT_MINUTES, redis_client
    )


class TestPasswordMismatchStore:
    """パスワード不一致の記録（失敗回数ロック）のテスト"""

    async def test_not_locked_without_failures(self, fake_redis):
        """失敗がなければロックされないこと"""
        assert await _is_locked(uuid4(), fake_redis) is False

    async def test_locks_when_failures_reach_max_attempts(self, fake_redis):
        """上限未満の失敗ではロックされず、上限回目の失敗でロックされること"""
        user_id = uuid4()

        results = [await _record(user_id, fake_redis) for _ in range(MAX_ATTEMPTS)]

        assert results == [False] * (MAX_ATTEMPTS - 1) + [True]
        assert await _is_locked(user_id, fake_redis) is True

    async def test_ignores_failures_older_than_lockout_window(self, fake_redis):
        """ロック時間を過ぎた失敗は数えないこと"""
        user_id = uuid4()
        past = time.time() - LOCKOUT_SECONDS - 1
        with patch(TIME_PATH, return_value=past):
            for _ in range(MAX_ATTEMPTS):
                await _record(user_id, fake_redis)

        assert await _is_locked(user_id, fake_redis) is False
        # 古い失敗は新しい失敗と合算されないこと
        assert await _record(user_id, fake_redis) is False

    async def test_clear_failures_unlocks(self, fake_redis):
        """失敗記録を削除するとロックが解除されること"""
        user_id = uuid4()
        for _ in range(MAX_ATTEMPTS):
            await _record(user_id, fake_redis)

        await password_mismatch_store.clear_failures(user_id, TENANT_ID, fake_redis)

        assert await _is_locked(user_id, fake_redis) is False

    async def test_counts_failures_per_user_and_tenant(self, fake_redis):
        """失敗はユーザー・テナントごとに数えること"""
        user_id = uuid4()
        for _ in range(MAX_ATTEMPTS):
            await _record(user_id, fake_redis)

        assert await _is_locked(uuid4(), fake_redis) is False
        assert await _is_locked(user_id, fake_redis, "other-tenant") is False

    async def test_sets_expiry_to_lockout_window(self, fake_redis):
        """失敗記録はロック時間で自動的に消える設定になること"""
        user_id = uuid4()
        await _record(user_id, fake_redis)

        ttl = await fake_redis.ttl(f"password_mismatch:{TENANT_ID}:{user_id}")

        assert 0 < ttl <= LOCKOUT_SECONDS
