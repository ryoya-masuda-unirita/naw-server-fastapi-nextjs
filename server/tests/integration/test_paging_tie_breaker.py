"""ページング一覧で、並べ替えキーが同じ値の行が、ページの境界をまたいでも重複・漏れしないことのテスト（NAW-1442）。

並べ替えのキーが同じ値の行どうしの順番は、DB が保証しない。一意なキー（ID など）で最後まで
並べないと、ページを送るたびに順番が変わりうる。そのため、同じ値の行が複数ある一覧を、
小さいページサイズでめくり、各行がちょうど 1 回だけ現れ、一意キーの昇順に並ぶことを確かめる。

SQLite は、並びの指定がない行を、挿入順（または、その逆）で返す。直す前に確実に失敗するよう、
同じ値の行を、ID の昇順・逆順の 2 通りの順で挿入して確かめる。
"""

import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assistant import Assistant, AssistantType
from app.models.library import Library
from app.models.library_tag import LibraryTag
from app.models.message import Message, MessageFeedback, MessageRating
from app.models.room import Room, RoomRating
from app.models.tenant import Tenant
from app.models.token_usage import TokenUsage
from app.models.user import User, UserRole
from app.repositories.library_repository import LibraryRepository
from app.repositories.library_tag_repository import LibraryTagRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.token_usage_repository import TokenUsageRepository

# 同じ値の行の数と、ページサイズ。ページ境界が、同じ値の行の途中に来るようにする（5 件を 2 件ずつ）
TIE_COUNT = 5
PAGE_SIZE = 2

# UUID の先頭の 4 ビット。数字だけの 16 進数だと、SQLite が数値として保存し直して壊れるため、英字（a）にする
UUID_PREFIX = 0xA << 124

# 同じ値の行を、ID の昇順・逆順のどちらの順で挿入するか
INSERT_ORDERS = {
    "id-ascending": list(range(TIE_COUNT)),
    "id-descending": list(reversed(range(TIE_COUNT))),
}
SAME_TIME = datetime(2026, 6, 10, 12, 0, tzinfo=UTC)

insert_order = pytest.mark.parametrize(
    "indexes", list(INSERT_ORDERS.values()), ids=list(INSERT_ORDERS)
)
descending = pytest.mark.parametrize("desc", [False, True], ids=["asc", "desc"])


def _str_id(prefix: str, index: int) -> str:
    """文字列 ID を作る。昇順の文字列比較が、index の昇順と一致する（1 桁）。

    Parameters
    ----------
    prefix : str
        ID の接頭辞。
    index : int
        0 から始まる連番。

    Returns
    -------
    str
        ``{prefix}-{index}``。
    """
    return f"{prefix}-{index}"


def _uuid_id(index: int) -> uuid.UUID:
    """UUID の ID を作る。UUID の大小が、index の大小と一致する。

    Parameters
    ----------
    index : int
        0 から始まる連番。

    Returns
    -------
    uuid.UUID
        先頭が英字で、index が大きいほど大きい UUID。
    """
    return uuid.UUID(int=UUID_PREFIX + index)


async def _collect(fetch_page: Callable[[int], Awaitable[list[str]]]) -> list[str]:
    """ページを 1 つずつ最後までめくり、現れた ID を、現れた順に集める。

    Parameters
    ----------
    fetch_page : Callable[[int], Awaitable[list[str]]]
        ページ番号（0 始まり）を受け取り、そのページの ID の一覧を返す関数。

    Returns
    -------
    list[str]
        全ページの ID（重複があれば、重複したまま）。
    """
    seen: list[str] = []
    page = 0
    while True:
        ids = await fetch_page(page)
        if not ids:
            return seen
        seen.extend(ids)
        page += 1


def _assert_each_row_once_in_id_order(seen: list[str], expected: list[str]) -> None:
    """各行がちょうど 1 回だけ現れ、一意キーの昇順に並ぶことを確かめる。

    Parameters
    ----------
    seen : list[str]
        ページをめくって集めた ID。
    expected : list[str]
        一意キーの昇順に並べた、全行の ID。
    """
    assert len(seen) == len(set(seen)), f"同じ行が複数のページに現れた: {seen}"
    assert seen == expected


async def _tenant(session: AsyncSession, tenant_id: str) -> Tenant:
    """テスト用のテナントを作る。

    Parameters
    ----------
    session : AsyncSession
        テスト用の DB セッション。
    tenant_id : str
        テナント ID。

    Returns
    -------
    Tenant
        保存したテナント。
    """
    tenant = Tenant(
        id=tenant_id,
        name=tenant_id,
        owner="admin",
        pw_policy_min_length=8,
        pw_policy_use_uppercase=True,
        pw_policy_use_lowercase=True,
        pw_policy_use_digits=True,
        pw_policy_use_symbols=True,
        pw_policy_valid_symbols="!@#$",
        pw_validity_period_days=90,
        pw_histories_limit=3,
    )
    session.add(tenant)
    await session.commit()
    return tenant


async def _user(
    session: AsyncSession,
    tenant: Tenant,
    login_id: str,
    user_id: uuid.UUID | None = None,
) -> User:
    """テスト用のユーザーを作る。

    Parameters
    ----------
    session : AsyncSession
        テスト用の DB セッション。
    tenant : Tenant
        所属テナント。
    login_id : str
        ログイン ID（名前にも使う）。
    user_id : uuid.UUID | None, optional
        ユーザー ID。省略時は、ランダム。

    Returns
    -------
    User
        保存したユーザー。
    """
    user = User(
        id=user_id or uuid.uuid4(),
        tenant_id=tenant.id,
        login_id=login_id,
        name=login_id,
        role=UserRole.USER,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    return user


async def _assistant(session: AsyncSession, tenant: Tenant) -> Assistant:
    """テスト用のアシスタントを作る。

    Parameters
    ----------
    session : AsyncSession
        テスト用の DB セッション。
    tenant : Tenant
        所属テナント。

    Returns
    -------
    Assistant
        保存したアシスタント。
    """
    assistant = Assistant(
        tenant_id=tenant.id,
        type=AssistantType.SAAS_CHAT,
        name="Tie Test Assistant",
        include_history=False,
    )
    session.add(assistant)
    await session.commit()
    await session.refresh(assistant)
    return assistant


async def _room(
    session: AsyncSession,
    tenant: Tenant,
    user: User,
    assistant: Assistant,
    room_id: str | None = None,
    **fields: object,
) -> Room:
    """テスト用のルームを作る。

    Parameters
    ----------
    session : AsyncSession
        テスト用の DB セッション。
    tenant : Tenant
        所属テナント。
    user : User
        ルームの所有者。
    assistant : Assistant
        ルームの既定のアシスタント。
    room_id : str | None, optional
        ルーム ID。省略時は、ランダム。
    **fields : object
        ルームのその他の項目（名前・評価・更新日時など）。

    Returns
    -------
    Room
        保存したルーム。
    """
    kwargs: dict[str, object] = {
        "tenant_id": tenant.id,
        "default_assistant_id": assistant.id,
        "user_id": user.id,
        **fields,
    }
    if room_id is not None:
        kwargs["id"] = room_id
    room = Room(**kwargs)
    session.add(room)
    await session.commit()
    return room


@insert_order
@descending
async def test_library_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """ライブラリ一覧で、同じタイトルの行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-library")
    owner = await _user(session, tenant, "tie-library-owner")
    assistant = await _assistant(session, tenant)
    room = await _room(session, tenant, owner, assistant)
    for i in indexes:
        message = Message(id=_str_id("lm", i), tenant_id=tenant.id, room_id=room.id)
        session.add(message)
        await session.commit()
        session.add(
            Library(
                id=_uuid_id(i),
                tenant_id=tenant.id,
                message_id=message.id,
                user_id=owner.id,
                title="同じタイトル",
            )
        )
        await session.commit()

    async def fetch(page: int) -> list[str]:
        libraries, _ = await LibraryRepository.find_page(
            tenant.id,
            owner.id,
            page,
            PAGE_SIZE,
            None,
            None,
            None,
            None,
            "title",
            "desc" if desc else "asc",
            session,
        )
        return [str(lib.id) for lib in libraries]

    expected = [str(_uuid_id(i)) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
@descending
async def test_token_usage_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """利用履歴で、同じ作成日時の行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-token-usage")
    for i in indexes:
        session.add(
            TokenUsage(
                id=_str_id("tu", i),
                tenant_id=tenant.id,
                model="gpt-4",
                created_at=SAME_TIME,
            )
        )
        await session.commit()

    async def fetch(page: int) -> list[str]:
        usages, _ = await TokenUsageRepository.find_page(
            tenant.id,
            SAME_TIME - timedelta(days=1),
            SAME_TIME + timedelta(days=1),
            None,
            page,
            PAGE_SIZE,
            "createdAt",
            desc,
            session,
        )
        return [u.id for u in usages]

    expected = [_str_id("tu", i) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
@descending
async def test_feedback_message_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """フィードバック（メッセージ）で、同じ更新日時の行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-feedback-message")
    user = await _user(session, tenant, "tie-feedback-message-user")
    assistant = await _assistant(session, tenant)
    room = await _room(session, tenant, user, assistant)
    for i in indexes:
        message = Message(id=_str_id("fm", i), tenant_id=tenant.id, room_id=room.id)
        session.add(message)
        await session.commit()
        session.add(
            MessageFeedback(
                id=_str_id("fb", i),
                tenant_id=tenant.id,
                user_id=user.id,
                message_id=message.id,
                rating=MessageRating.GOOD,
                updated_at=SAME_TIME,
            )
        )
        await session.commit()

    async def fetch(page: int) -> list[str]:
        rows, _ = await MessageFeedbackRepository.find_feedback_messages(
            tenant.id, None, None, None, "updated_at", desc, page, PAGE_SIZE, session
        )
        return [row.feedback_id for row in rows]

    expected = [_str_id("fb", i) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
@descending
async def test_feedback_user_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """フィードバック（ユーザー）で、同じ件数の行が、ページをめくっても重複・漏れなく、ユーザー ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-feedback-user")
    for i in indexes:
        await _user(session, tenant, f"tie-user-{i}", user_id=_uuid_id(i))

    async def fetch(page: int) -> list[str]:
        rows, _ = await MessageFeedbackRepository.find_feedback_users(
            tenant.id,
            None,
            None,
            "feedback_message_count",
            desc,
            page,
            PAGE_SIZE,
            session,
        )
        return [str(row.user_id) for row in rows]

    expected = [str(_uuid_id(i)) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
@descending
async def test_feedback_room_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """フィードバック（ルーム）で、同じ名前の行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-feedback-room")
    user = await _user(session, tenant, "tie-feedback-room-user")
    assistant = await _assistant(session, tenant)
    for i in indexes:
        await _room(
            session,
            tenant,
            user,
            assistant,
            room_id=_str_id("fr", i),
            name="同じルーム名",
            rating=RoomRating.GOOD,
        )

    async def fetch(page: int) -> list[str]:
        rows, _ = await RoomRepository.find_feedback_rooms(
            tenant.id, None, None, "room_name", desc, page, PAGE_SIZE, session
        )
        return [row.room_id for row in rows]

    expected = [_str_id("fr", i) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
@descending
async def test_admin_history_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int], desc: bool
) -> None:
    """チャット履歴（管理者）で、同じ名前の行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-admin-history")
    user = await _user(session, tenant, "tie-admin-history-user")
    assistant = await _assistant(session, tenant)
    for i in indexes:
        await _room(
            session,
            tenant,
            user,
            assistant,
            room_id=_str_id("ah", i),
            name="同じルーム名",
        )

    async def fetch(page: int) -> list[str]:
        rows, _ = await RoomRepository.find_admin_histories(
            tenant.id,
            None,
            None,
            None,
            None,
            None,
            None,
            "name",
            desc,
            page,
            PAGE_SIZE,
            session,
        )
        return [row.room_id for row in rows]

    expected = [_str_id("ah", i) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
async def test_viewable_room_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int]
) -> None:
    """自分が見られるルームの一覧で、同じ更新日時の行が、ページをめくっても重複・漏れなく、ID の昇順に並ぶこと"""
    tenant = await _tenant(session, "tenant-tie-viewable-room")
    user = await _user(session, tenant, "tie-viewable-room-user")
    assistant = await _assistant(session, tenant)
    for i in indexes:
        await _room(
            session,
            tenant,
            user,
            assistant,
            room_id=_str_id("vr", i),
            updated_at=SAME_TIME,
        )

    async def fetch(page: int) -> list[str]:
        rooms, _ = await RoomRepository.find_page_viewable_by_user(
            tenant.id, user.id, [], page, PAGE_SIZE, None, session
        )
        return [room.id for room in rooms]

    expected = [_str_id("vr", i) for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)


@insert_order
async def test_library_tag_list_has_no_duplicates_or_gaps_across_pages(
    session: AsyncSession, indexes: list[int]
) -> None:
    """ライブラリのタグで、ページをめくっても、各行が 1 回だけ現れ、名前の昇順に並ぶこと。

    タグの名前は、テナント内で一意（一意制約）なので、同じ名前の行は作れない。この確認は、
    一意キーを足しても、並びが変わらないことを確かめる（直す前から通る）。
    """
    tenant = await _tenant(session, "tenant-tie-library-tag")
    for i in indexes:
        session.add(
            LibraryTag(id=_str_id("lt", i), tenant_id=tenant.id, name=f"tag-{i}")
        )
        await session.commit()

    async def fetch(page: int) -> list[str]:
        tags, _ = await LibraryTagRepository.find_page(
            tenant.id, None, page, PAGE_SIZE, session
        )
        return [t.name for t in tags]

    expected = [f"tag-{i}" for i in range(TIE_COUNT)]
    _assert_each_row_once_in_id_order(await _collect(fetch), expected)
