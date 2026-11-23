"""パスワード不一致（ログイン・パスワード再設定の失敗）の記録をRedisで管理する。

移植元 Spring Boot の`PasswordMismatchHistoryRepository`（テーブル
`password_mismatch_histories`）と、それを使う`PasswordResetAttemptService`（パスワード
再設定のロック）・`LoginAttemptService`（ログインのロック）に相当する。backend には
このテーブルがないため、DBのマイグレーションを追加せず、ログインセッションと同じRedisに
保存する（Issue #248・#265）。

移植元はログインとパスワード再設定の失敗を同じテーブルに記録し、どちらのロック判定も
両方の失敗を数える。成功（ログイン・パスワード再設定）すると記録をすべて消す。ここでも
1ユーザーにつき1つのキーに両方の失敗を記録し、同じように数える。

ログインのロックは期間を区切らず通算の件数を数えるため、記録は期間で捨てず、有効期限も
付けない（移植元のテーブルも成功するまで記録を消さない）。ただしどちらの判定も、新しい方
から「ログインの上限回数」と「パスワード再設定の上限回数」の大きい方の件数があれば結果が
変わらないため、それより古い記録は記録のたびに捨て、1ユーザーの記録の件数に上限を設ける。

Redisへの書き込みはDBのトランザクションと独立しているため、移植元が失敗記録を
`REQUIRES_NEW`で確定させているのと同じく、呼び出し元の処理が失敗しても記録は残る。
"""

import time
import uuid

import redis.asyncio as redis
from redis.asyncio.client import Pipeline

from app.core.config import get_password_reset_settings

# 移植元`LoginAttemptService.FAILURE_THRESHOLD`。移植元でも設定ではなく固定値
LOGIN_FAILURE_THRESHOLD = 6
# 移植元`LoginAttemptService.RATE_LIMIT_MINUTES`。移植元でも設定ではなく固定値
LOGIN_RATE_LIMIT_MINUTES = 15

_KEY_PREFIX = "password_mismatch:"
_SECONDS_PER_MINUTE = 60
# 移植元はログイン前の判定・失敗を記録した直後の判定のどちらも、新しい方から
# 2番目の失敗（`findTop2...`の`get(1)`）の時刻でロック中かを決める
_PREVIOUS_FAILURE_INDEX = 1


def _key(user_id: uuid.UUID, tenant_id: str) -> str:
    """ユーザーの失敗記録を保存するキーを返す。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。

    Returns
    -------
    str
        Redisのキー。
    """
    return f"{_KEY_PREFIX}{tenant_id}:{user_id}"


def _window_start(lockout_minutes: int, now: float) -> float:
    """失敗を数える期間の開始時刻（UNIX秒）を返す。

    Parameters
    ----------
    lockout_minutes : int
        失敗を数える期間（分）。
    now : float
        現在時刻（UNIX秒）。

    Returns
    -------
    float
        期間の開始時刻。この時刻ちょうどの記録は数えない。
    """
    return now - lockout_minutes * _SECONDS_PER_MINUTE


def _add_failure(
    pipe: Pipeline, key: str, now: float, password_reset_max_attempts: int
) -> None:
    """失敗を1件記録し、判定に使わない古い記録を捨てるコマンドをパイプラインに積む。

    ログインの判定は通算件数が上限以上か（上限件あれば足りる）と2番目に新しい失敗、
    パスワード再設定の判定はロック時間内の件数が上限以上か（新しい方から上限件あれば
    足りる）しか見ないため、新しい方から両者の上限の大きい方の件数だけ残す。

    Parameters
    ----------
    pipe : Pipeline
        Redisのパイプライン。
    key : str
        失敗記録のキー。
    now : float
        失敗した時刻（UNIX秒）。
    password_reset_max_attempts : int
        パスワード再設定のロックする失敗回数。
    """
    retained = max(LOGIN_FAILURE_THRESHOLD, password_reset_max_attempts)
    # 同じ時刻の失敗も別件として数えるため、メンバーは失敗ごとに一意にする
    pipe.zadd(key, {uuid.uuid4().hex: now})
    # 順位は古い方から0始まりのため、新しい方から retained 件より前を消す
    pipe.zremrangebyrank(key, 0, -(retained + 1))


async def is_locked_out(
    user_id: uuid.UUID,
    tenant_id: str,
    max_attempts: int,
    lockout_minutes: int,
    redis_client: redis.Redis,
) -> bool:
    """パスワード再設定のロック中か（ロック時間内の失敗が上限に達しているか）を判定する。

    失敗は記録しない。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    max_attempts : int
        ロックする失敗回数。
    lockout_minutes : int
        失敗を数える期間（分）。
    redis_client : redis.Redis
        Redis非同期クライアント。

    Returns
    -------
    bool
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
    """パスワード再設定の失敗を記録し、その結果ロックすべきかを判定する。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    max_attempts : int
        ロックする失敗回数。
    lockout_minutes : int
        失敗を数える期間（分）。
    redis_client : redis.Redis
        Redis非同期クライアント。

    Returns
    -------
    bool
        今回の失敗を含めてロック時間内の失敗が上限に達したら`True`。
    """
    key = _key(user_id, tenant_id)
    now = time.time()
    since = _window_start(lockout_minutes, now)
    async with redis_client.pipeline(transaction=True) as pipe:
        _add_failure(pipe, key, now, max_attempts)
        # 記録と同じトランザクションで数え、判定のための往復を増やさない
        pipe.zcount(key, f"({since}", "+inf")
        results = await pipe.execute()
    return int(results[-1]) >= max_attempts


def _is_login_locked(
    failure_count: int,
    recent_failures: list[tuple[str, float]],
    now: float,
) -> bool:
    """移植元`LoginAttemptService.isCurrentlyLocked`と同じ規則でログインのロックを判定する。

    Parameters
    ----------
    failure_count : int
        期間を区切らない通算の失敗件数（上限を超えて残さないため、
        実際の通算件数より少ないことがあるが、上限以上かの判定は変わらない）。
    recent_failures : list[tuple[str, float]]
        新しい方から2番目の失敗（メンバーと時刻の組）。なければ空。
    now : float
        現在時刻（UNIX秒）。

    Returns
    -------
    bool
        通算の失敗が上限以上で、2番目に新しい失敗がロック時間内なら`True`。
    """
    if failure_count < LOGIN_FAILURE_THRESHOLD or not recent_failures:
        return False
    _, previous_failure_at = recent_failures[0]
    # 移植元の`isAfter`と同じく、ロック時間の開始時刻ちょうどの失敗はロックしない
    return previous_failure_at > _window_start(LOGIN_RATE_LIMIT_MINUTES, now)


async def is_login_locked_out(
    user_id: uuid.UUID, tenant_id: str, redis_client: redis.Redis
) -> bool:
    """ログインがロック中かを判定する（失敗は記録しない）。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    redis_client : redis.Redis
        Redis非同期クライアント。

    Returns
    -------
    bool
        ロック中なら`True`。
    """
    key = _key(user_id, tenant_id)
    now = time.time()
    # 件数と時刻を同じ時点の記録から読むため、1つのトランザクションで取る
    async with redis_client.pipeline(transaction=True) as pipe:
        pipe.zcard(key)
        pipe.zrevrange(
            key, _PREVIOUS_FAILURE_INDEX, _PREVIOUS_FAILURE_INDEX, withscores=True
        )
        failure_count, recent_failures = await pipe.execute()
    return _is_login_locked(int(failure_count), recent_failures, now)


async def record_login_failure_and_check_lockout(
    user_id: uuid.UUID, tenant_id: str, redis_client: redis.Redis
) -> bool:
    """ログインの失敗を記録し、その結果ロックすべきかを判定する。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    redis_client : redis.Redis
        Redis非同期クライアント。

    Returns
    -------
    bool
        今回の失敗を含めてロックの条件を満たしたら`True`。
    """
    key = _key(user_id, tenant_id)
    now = time.time()
    # 移植元は記録と判定を同じトランザクションで行うため、合わせる
    password_reset_max_attempts = get_password_reset_settings().max_failure_attempts
    async with redis_client.pipeline(transaction=True) as pipe:
        _add_failure(pipe, key, now, password_reset_max_attempts)
        pipe.zcard(key)
        pipe.zrevrange(
            key, _PREVIOUS_FAILURE_INDEX, _PREVIOUS_FAILURE_INDEX, withscores=True
        )
        _, _, failure_count, recent_failures = await pipe.execute()
    return _is_login_locked(int(failure_count), recent_failures, now)


async def clear_failures(
    user_id: uuid.UUID, tenant_id: str, redis_client: redis.Redis
) -> None:
    """ユーザーの失敗記録をすべて削除する。

    ログイン成功・パスワード再設定成功のどちらでも呼ぶ（移植元の
    `deleteAllByUserIdAndTenantId`）。

    Parameters
    ----------
    user_id : uuid.UUID
        ユーザーID。
    tenant_id : str
        テナントID。
    redis_client : redis.Redis
        Redis非同期クライアント。
    """
    await redis_client.delete(_key(user_id, tenant_id))
