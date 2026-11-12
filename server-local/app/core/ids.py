import uuid
from collections.abc import Awaitable, Callable

DEFAULT_MAX_ATTEMPTS = 10


async def create_unique_id(
    exists: Callable[[str], Awaitable[bool]],
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> str:
    """移植元 UUIDFactory.createUniqueIdFrom の移植。

    ハイフンなしの UUID（32 文字）を作り、既存 ID と重複していれば作り直す。
    ID 列が varchar(32) のため、ハイフン付き（36 文字）にはしない。

    Parameters
    ----------
    exists : Callable[[str], Awaitable[bool]]
        候補の ID が既に使われているかを返す関数。
    max_attempts : int, optional
        作り直す上限回数。

    Returns
    -------
    str
        まだ使われていない 32 文字の ID。

    Raises
    ------
    RuntimeError
        上限回数まで作り直しても重複した場合。
    """
    for _ in range(max_attempts):
        candidate = uuid.uuid4().hex
        if not await exists(candidate):
            return candidate
    raise RuntimeError("一意のUUIDを生成できませんでした。")
