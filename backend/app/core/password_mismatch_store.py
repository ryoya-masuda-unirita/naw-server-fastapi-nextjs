"""パスワード不一致（旧パスワード誤り）の記録をRedisで管理する。

移植元 Spring Boot の`PasswordResetAttemptService`と`PasswordMismatchHistoryRepository`
（テーブル`password_mismatch_histories`）に相当する。backend にはこのテーブルがなく、
ロック判定にはロック時間内の記録だけを使うため、DBのマイグレーションを追加せず、
ログインセッションと同じRedisに一時的な状態として保存する（Issue #248）。

Redisへの書き込みはDBのトランザクションと独立しているため、移植元が失敗記録を
`REQUIRES_NEW`で確定させているのと同じく、呼び出し元の処理が失敗しても記録は残る。

移植元はログイン失敗（`LoginAttemptService`）も同じテーブルに記録するため、キー名は
パスワード再設定に限定しない名前にしている。ただしログイン側は期間を区切らず全件を
数えるため、ログイン失敗ロックを移植する際は保持期間（有効期限）を見直すこと。
"""

import time
import uuid

import redis.asyncio as redis

_KEY_PREFIX = "password_mismatch:"
_SECONDS_PER_MINUTE = 60


def _key(user_id: uuid.UUID, tenant_id: str) -> str:
    """ユーザーの失敗記録を保存するキーを返す。

    Args:
        user_id: ユーザーID。
        tenant_id: テナントID。

    Returns:
        Redisのキー。
    """
    return f"{_KEY_PREFIX}{tenant_id}:{user_id}"


def _window_start(lockout_minutes: int, now: float) -> float:
    """失敗を数える期間の開始時刻（UNIX秒）を返す。

    Args:
        lockout_minutes: 失敗を数える期間（分）。
        now: 現在時刻（UNIX秒）。

    Returns:
        期間の開始時刻。この時刻ちょうどの記録は数えない。
    """
    return now - lockout_minutes * _SECONDS_PER_MINUTE


async def is_locked_out(
    user_id: uuid.UUID,
    tenant_id: str,
    max_attempts: int,
    lockout_minutes: int,
    redis_client: redis.Redis,
) -> bool:
    """ロック時間内の失敗が上限に達しているかを判定する（失敗は記録しない）。

    Args:
        user_id: ユーザーID。
        tenant_id: テナントID。
        max_attempts: ロックする失敗回数。
        lockout_minutes: 失敗を数える期間（分）。
        redis_client: Redis非同期クライアント。

    Returns:
        ロック中なら`True`。
    """
    since = _window_start(lockout_minutes, time.time())
    # 移植元の`countBy...CreatedAtAfter`と同じく、期間の開始時刻ちょうどの記録は含めない
    failures = await redis_client.zcount(_key(user_id, tenant_id), f"({since}", "+inf")
    return int(failures) >= max_attempts


async def record_failure_and_check_lockout(
    user_id: uuid.UUID,
    tenant_id: str,
    max_attempts: int,
    lockout_minutes: int,
    redis_client: redis.Redis,
) -> bool:
    """失敗を記録し、その結果ロックすべきかを判定する。

    Args:
        user_id: ユーザーID。
        tenant_id: テナントID。
        max_attempts: ロックする失敗回数。
        lockout_minutes: 失敗を数える期間（分）。
        redis_client: Redis非同期クライアント。

    Returns:
        今回の失敗を含めてロック時間内の失敗が上限に達したら`True`。
    """
    key = _key(user_id, tenant_id)
    now = time.time()
    since = _window_start(lockout_minutes, now)
    async with redis_client.pipeline(transaction=True) as pipe:
        # 同じ時刻の失敗も別件として数えるため、メンバーは失敗ごとに一意にする
        pipe.zadd(key, {uuid.uuid4().hex: now})
        # ロック時間を過ぎた記録は判定に使わないため、記録のたびに捨てる
        pipe.zremrangebyscore(key, "-inf", since)
        # 最後の失敗からロック時間が経てば記録は不要になるため、キーごと自動で消す
        pipe.expire(key, lockout_minutes * _SECONDS_PER_MINUTE)
        # 記録と同じトランザクションで数え、判定のための往復を増やさない
        pipe.zcount(key, f"({since}", "+inf")
        results = await pipe.execute()
    return int(results[-1]) >= max_attempts


async def clear_failures(
    user_id: uuid.UUID, tenant_id: str, redis_client: redis.Redis
) -> None:
    """ユーザーの失敗記録をすべて削除する。

    Args:
        user_id: ユーザーID。
        tenant_id: テナントID。
        redis_client: Redis非同期クライアント。
    """
    await redis_client.delete(_key(user_id, tenant_id))
