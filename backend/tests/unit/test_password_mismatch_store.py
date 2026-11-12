import time
from unittest.mock import patch
from uuid import uuid4

from app.core import password_mismatch_store
from app.core.config import get_password_reset_settings
from app.core.password_mismatch_store import (
    LOGIN_FAILURE_THRESHOLD,
    LOGIN_RATE_LIMIT_MINUTES,
)

TENANT_ID = "test-tenant"
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
LOCKOUT_SECONDS = LOCKOUT_MINUTES * 60
LOGIN_RATE_LIMIT_SECONDS = LOGIN_RATE_LIMIT_MINUTES * 60
TIME_PATH = "app.core.password_mismatch_store.time.time"
# Redis の TTL コマンドが「有効期限なし」で返す値
NO_EXPIRY = -1


def _key(user_id, tenant_id: str = TENANT_ID) -> str:
    return f"password_mismatch:{tenant_id}:{user_id}"


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

    async def test_keeps_failures_without_expiry(self, fake_redis):
        """ログインが通算で数えるため、失敗記録に有効期限を付けず古い記録も残すこと"""
        user_id = uuid4()
        past = time.time() - LOCKOUT_SECONDS - 1
        with patch(TIME_PATH, return_value=past):
            await _record(user_id, fake_redis)
        await _record(user_id, fake_redis)

        key = _key(user_id)

        assert await fake_redis.ttl(key) == NO_EXPIRY
        assert await fake_redis.zcard(key) == 2


async def _record_login(user_id, redis_client, tenant_id: str = TENANT_ID) -> bool:
    return await password_mismatch_store.record_login_failure_and_check_lockout(
        user_id, tenant_id, redis_client
    )


async def _record_login_at(user_id, redis_client, at: float, count: int) -> None:
    """時刻 at にログインの失敗を count 回記録する。"""
    with patch(TIME_PATH, return_value=at):
        for _ in range(count):
            await _record_login(user_id, redis_client)


async def _is_login_locked(user_id, redis_client, tenant_id: str = TENANT_ID) -> bool:
    return await password_mismatch_store.is_login_locked_out(
        user_id, tenant_id, redis_client
    )


class TestLoginLockout:
    """ログインの失敗回数ロック（移植元 LoginAttemptService）のテスト"""

    async def test_login_not_locked_without_failures(self, fake_redis):
        """失敗がなければロックされないこと"""
        assert await _is_login_locked(uuid4(), fake_redis) is False

    async def test_login_locks_on_sixth_failure(self, fake_redis):
        """5 回目まではロックされず、6 回目の失敗でロックされること"""
        user_id = uuid4()

        results = [
            await _record_login(user_id, fake_redis)
            for _ in range(LOGIN_FAILURE_THRESHOLD)
        ]

        assert results == [False] * (LOGIN_FAILURE_THRESHOLD - 1) + [True]
        assert await _is_login_locked(user_id, fake_redis) is True

    async def test_login_not_locked_when_previous_failure_is_old(self, fake_redis):
        """2 番目に新しい失敗がロック時間より前ならロックされないこと"""
        user_id = uuid4()
        await _record_login_at(
            user_id,
            fake_redis,
            time.time() - LOGIN_RATE_LIMIT_SECONDS - 60,
            LOGIN_FAILURE_THRESHOLD,
        )

        assert await _is_login_locked(user_id, fake_redis) is False

    async def test_login_not_locked_at_window_boundary(self, fake_redis):
        """2 番目に新しい失敗がロック時間の開始時刻ちょうどならロックされないこと"""
        user_id = uuid4()
        now = time.time()
        await _record_login_at(
            user_id,
            fake_redis,
            now - LOGIN_RATE_LIMIT_SECONDS,
            LOGIN_FAILURE_THRESHOLD,
        )

        with patch(TIME_PATH, return_value=now):
            assert await _is_login_locked(user_id, fake_redis) is False

    async def test_login_locked_just_inside_window(self, fake_redis):
        """2 番目に新しい失敗がロック時間の開始時刻より後ならロックされること"""
        user_id = uuid4()
        now = time.time()
        await _record_login_at(
            user_id,
            fake_redis,
            now - LOGIN_RATE_LIMIT_SECONDS + 1,
            LOGIN_FAILURE_THRESHOLD,
        )

        with patch(TIME_PATH, return_value=now):
            assert await _is_login_locked(user_id, fake_redis) is True

    async def test_login_relocks_on_two_failures_within_window(self, fake_redis):
        """上限に達した後は、ロック時間内に 2 回失敗すると再びロックされること"""
        user_id = uuid4()
        await _record_login_at(
            user_id,
            fake_redis,
            time.time() - LOGIN_RATE_LIMIT_SECONDS - 60,
            LOGIN_FAILURE_THRESHOLD,
        )

        first = await _record_login(user_id, fake_redis)
        second = await _record_login(user_id, fake_redis)

        assert (first, second) == (False, True)

    async def test_login_counts_failures_without_window(self, fake_redis):
        """ロック時間より前の失敗も通算の件数に数えること"""
        user_id = uuid4()
        await _record_login_at(
            user_id,
            fake_redis,
            time.time() - LOGIN_RATE_LIMIT_SECONDS - 60,
            LOGIN_FAILURE_THRESHOLD - 2,
        )

        results = [await _record_login(user_id, fake_redis) for _ in range(2)]

        assert results == [False, True]

    async def test_login_counts_password_reset_failures(self, fake_redis):
        """パスワード再設定の失敗もログインの通算件数に数えること"""
        user_id = uuid4()
        for _ in range(LOGIN_FAILURE_THRESHOLD - 1):
            await _record(user_id, fake_redis)

        assert await _record_login(user_id, fake_redis) is True

    async def test_password_reset_counts_login_failures(self, fake_redis):
        """ログインの失敗もパスワード再設定のロック時間内の件数に数えること"""
        user_id = uuid4()
        for _ in range(MAX_ATTEMPTS - 1):
            await _record_login(user_id, fake_redis)

        assert await _record(user_id, fake_redis) is True

    async def test_caps_retained_failures_without_changing_lockout(self, fake_redis):
        """記録は判定に必要な件数だけ残し、件数を捨ててもロックの判定が変わらないこと"""
        user_id = uuid4()
        retained = max(
            LOGIN_FAILURE_THRESHOLD, get_password_reset_settings().max_failure_attempts
        )
        for _ in range(retained + 3):
            await _record_login(user_id, fake_redis)

        assert await fake_redis.zcard(_key(user_id)) == retained
        assert await _is_login_locked(user_id, fake_redis) is True

    async def test_login_unlocked_after_clear(self, fake_redis):
        """失敗記録を削除するとロックが解除されること"""
        user_id = uuid4()
        for _ in range(LOGIN_FAILURE_THRESHOLD):
            await _record_login(user_id, fake_redis)

        await password_mismatch_store.clear_failures(user_id, TENANT_ID, fake_redis)

        assert await _is_login_locked(user_id, fake_redis) is False

    async def test_login_counts_per_user_and_tenant(self, fake_redis):
        """失敗はユーザー・テナントごとに数えること"""
        user_id = uuid4()
        for _ in range(LOGIN_FAILURE_THRESHOLD):
            await _record_login(user_id, fake_redis)

        assert await _is_login_locked(uuid4(), fake_redis) is False
        assert await _is_login_locked(user_id, fake_redis, "other-tenant") is False
