"""フィードバック一覧（回答精度評価・チャット満足度）の並べ替えを、表示する値の順にするテスト。

内部 ID の順と表示名の順が逆になるデータを作り、画面に表示する値の順に並ぶことを確かめる。
"""

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.security import create_access_token
from app.models.assistant import Assistant, AssistantType
from app.models.index import Index, IndexType
from app.models.message import Message, MessageFeedback, MessageRating
from app.models.room import Room, RoomRating
from app.models.tenant import Tenant
from app.models.user import User, UserRole

_TENANT_ID = "tenant-feedback-sort"
_MESSAGE_URL = "/api/admin/feedbackMessage"
_ROOM_URL = "/api/admin/feedbackRoom"
# メッセージ側の並べ替えを確かめるデータのルームが持つ、並べ替えに関係しないアシスタント
_ROOM_ASSISTANT_ID = "a-room"


@pytest.fixture
async def admin_headers(session: AsyncSession) -> dict[str, str]:
    """テナントとテナント管理者を作り、認証ヘッダーを返す。"""
    session.add(
        Tenant(
            id=_TENANT_ID,
            name=_TENANT_ID,
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
    )
    await session.commit()
    user = User(
        id=uuid4(),
        tenant_id=_TENANT_ID,
        login_id="feedback-sort-admin",
        name="Feedback Sort Admin",
        role=UserRole.ADMIN,
        is_required_password_reset=False,
    )
    session.add(user)
    await session.commit()
    token = create_access_token(user.login_id, _TENANT_ID)
    return {"Authorization": f"Bearer {token}", "X-Tenant-ID": _TENANT_ID}


async def _user_id(session: AsyncSession) -> UUID:
    """テナント管理者のユーザー ID を返す。"""
    result = await session.execute(
        select(User).where(col(User.tenant_id) == _TENANT_ID)
    )
    return result.scalar_one().id


async def _add_assistants(session: AsyncSession, names_by_id: dict[str, str]) -> None:
    """ID と表示名を指定してアシスタントを作る。"""
    names_by_id = {**names_by_id, _ROOM_ASSISTANT_ID: "Room Assistant"}
    session.add_all(
        Assistant(
            id=assistant_id,
            tenant_id=_TENANT_ID,
            type=AssistantType.SAAS_CHAT,
            name=name,
            include_history=False,
        )
        for assistant_id, name in names_by_id.items()
    )
    await session.commit()


async def _add_folders(session: AsyncSession, names_by_id: dict[str, str]) -> None:
    """ID と名前を指定して学習先フォルダを作る。"""
    session.add_all(
        Index(id=folder_id, tenant_id=_TENANT_ID, type=IndexType.LOCAL, name=name)
        for folder_id, name in names_by_id.items()
    )
    await session.commit()


async def _add_feedback(
    session: AsyncSession,
    label: str,
    assistant_id: str | None,
    index_id: str | None,
    rating: MessageRating = MessageRating.GOOD,
) -> None:
    """ルーム・メッセージ・フィードバックを 1 件ずつ作る。"""
    user_id = await _user_id(session)
    room = Room(
        tenant_id=_TENANT_ID,
        name=label,
        default_assistant_id=_ROOM_ASSISTANT_ID,
        user_id=user_id,
    )
    session.add(room)
    await session.commit()
    message = Message(tenant_id=_TENANT_ID, room_id=room.id, assistant_id=assistant_id)
    session.add(message)
    await session.commit()
    session.add(
        MessageFeedback(
            tenant_id=_TENANT_ID,
            user_id=user_id,
            message_id=message.id,
            rating=rating,
            index_id=index_id,
        )
    )
    await session.commit()


async def _add_rooms(
    session: AsyncSession, rooms: list[tuple[str, str, RoomRating]]
) -> None:
    """（ルーム名, アシスタント ID, 評価）のルームを作る。"""
    user_id = await _user_id(session)
    session.add_all(
        Room(
            tenant_id=_TENANT_ID,
            name=name,
            default_assistant_id=assistant_id,
            user_id=user_id,
            rating=rating,
        )
        for name, assistant_id, rating in rooms
    )
    await session.commit()


async def _get_pages(
    client: AsyncClient,
    headers: dict[str, str],
    url: str,
    query: str,
    size: int = 50,
) -> list[dict]:
    """全ページを取得し、一覧の要素を結合して返す。"""
    items: list[dict] = []
    page = 0
    while True:
        response = await client.get(
            f"{url}?{query}&page={page}&size={size}", headers=headers
        )
        assert response.status_code == 200
        body = response.json()["feedbacks"]
        items.extend(body["content"])
        page += 1
        if page >= body["totalPages"]:
            return items


class TestFeedbackMessageSort:
    """回答精度評価（メッセージのフィードバック）の並べ替えのテスト。"""

    @pytest.fixture
    async def dataset(
        self, session: AsyncSession, admin_headers: dict[str, str]
    ) -> None:
        """内部 ID の順と表示名・フォルダ名の順が逆になるフィードバックを作る。"""
        await _add_assistants(
            session, {"a-1": "Cherry", "a-2": "Banana", "a-3": "Apple"}
        )
        await _add_folders(session, {"f-1": "Cherry", "f-2": "Banana", "f-3": "Apple"})
        await _add_feedback(session, "m1", "a-1", "f-1")
        await _add_feedback(session, "m2", "a-2", "f-2")
        await _add_feedback(session, "m3", "a-3", "f-3")

    @staticmethod
    def _names(items: list[dict]) -> list[str | None]:
        """一覧のアシスタント表示名を取り出す。"""
        return [item["message"]["assistantName"] for item in items]

    async def test_sorts_by_assistant_name_ascending(
        self, client: AsyncClient, admin_headers: dict[str, str], dataset: None
    ) -> None:
        """アシスタント表示名順の昇順で、表示名の順に並ぶこと"""
        items = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=name&sortOrder=asc"
        )

        assert self._names(items) == ["Apple", "Banana", "Cherry"]

    async def test_sorts_by_assistant_name_descending(
        self, client: AsyncClient, admin_headers: dict[str, str], dataset: None
    ) -> None:
        """アシスタント表示名順の降順で、表示名の逆順に並ぶこと"""
        items = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=name&sortOrder=desc"
        )

        assert self._names(items) == ["Cherry", "Banana", "Apple"]

    async def test_keeps_feedback_of_deleted_assistant(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        dataset: None,
    ) -> None:
        """アシスタントが削除された（assistant_id が空の）フィードバックも一覧に残ること"""
        await _add_feedback(session, "m4", None, "f-1")

        items = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=name&sortOrder=asc"
        )

        assert len(items) == 4
        assert sorted(n for n in self._names(items) if n) == [
            "Apple",
            "Banana",
            "Cherry",
        ]

    async def test_sorts_by_folder_name(
        self, client: AsyncClient, admin_headers: dict[str, str], dataset: None
    ) -> None:
        """学習先フォルダ名順で、昇順・降順ともにフォルダ名の順に並ぶこと"""
        asc = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=folder&sortOrder=asc"
        )
        desc = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=folder&sortOrder=desc"
        )

        assert [i["indexId"] for i in asc] == ["f-3", "f-2", "f-1"]
        assert [i["indexId"] for i in desc] == ["f-1", "f-2", "f-3"]

    async def test_keeps_feedback_without_folder(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        dataset: None,
    ) -> None:
        """学習先フォルダが無い・削除済みのフィードバックも一覧に残ること"""
        await _add_feedback(session, "m4", "a-1", None)
        await _add_feedback(session, "m5", "a-1", "f-deleted")

        items = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=folder&sortOrder=asc"
        )

        assert len(items) == 5

    async def test_add_sort_stays_in_folder_id_order(
        self, client: AsyncClient, admin_headers: dict[str, str], dataset: None
    ) -> None:
        """追加学習順は、これまでどおり内部のフォルダ ID の順に並ぶこと"""
        items = await _get_pages(
            client, admin_headers, _MESSAGE_URL, "sortField=add&sortOrder=asc"
        )

        assert [i["indexId"] for i in items] == ["f-1", "f-2", "f-3"]

    async def test_assistant_filter_with_name_sort(
        self, client: AsyncClient, admin_headers: dict[str, str], dataset: None
    ) -> None:
        """アシスタントで絞り込んだうえで表示名順に並べても、そのアシスタントだけが返ること"""
        items = await _get_pages(
            client,
            admin_headers,
            _MESSAGE_URL,
            "sortField=name&sortOrder=asc&assistantId=a-2",
        )

        assert self._names(items) == ["Banana"]

    async def test_name_sort_has_no_duplicates_or_gaps_across_pages(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        dataset: None,
    ) -> None:
        """複数ページにまたがっても、重複・欠落なく表示名の順に並ぶこと"""
        await _add_feedback(session, "m4", "a-3", "f-3")
        await _add_feedback(session, "m5", "a-2", "f-2")

        items = await _get_pages(
            client,
            admin_headers,
            _MESSAGE_URL,
            "sortField=name&sortOrder=asc",
            size=2,
        )

        assert self._names(items) == ["Apple", "Apple", "Banana", "Banana", "Cherry"]
        assert len({i["id"] for i in items}) == 5


class TestFeedbackRoomSort:
    """チャット満足度（ルームのフィードバック）の並べ替えのテスト。"""

    @pytest.fixture
    async def assistants(
        self, session: AsyncSession, admin_headers: dict[str, str]
    ) -> None:
        """内部 ID の順と表示名の順が逆で、大文字・小文字が混ざるアシスタントを作る。"""
        await _add_assistants(
            session, {"a-1": "banana", "a-2": "Cherry", "a-3": "Apple"}
        )

    async def test_sorts_by_assistant_name_case_insensitively(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        assistants: None,
    ) -> None:
        """アシスタント表示名順で、大文字・小文字を区別せず昇順・降順に並ぶこと"""
        await _add_rooms(
            session,
            [
                ("r1", "a-1", RoomRating.GOOD),
                ("r2", "a-2", RoomRating.GOOD),
                ("r3", "a-3", RoomRating.GOOD),
            ],
        )

        asc = await _get_pages(
            client, admin_headers, _ROOM_URL, "sortField=name&sortOrder=asc"
        )
        desc = await _get_pages(
            client, admin_headers, _ROOM_URL, "sortField=name&sortOrder=desc"
        )

        assert [i["room"]["name"] for i in asc] == ["r3", "r1", "r2"]
        assert [i["room"]["name"] for i in desc] == ["r2", "r1", "r3"]

    async def test_sorts_by_rating_stars(
        self,
        client: AsyncClient,
        session: AsyncSession,
        admin_headers: dict[str, str],
        assistants: None,
    ) -> None:
        """満足度順で、昇順は星 1→5、降順は星 5→1 の順に並ぶこと"""
        await _add_rooms(
            session,
            [
                ("star2", "a-1", RoomRating.AVERAGE),
                ("star5", "a-1", RoomRating.EXCELLENT),
                ("star3", "a-1", RoomRating.GOOD),
                ("star1", "a-1", RoomRating.POOR),
                ("star4", "a-1", RoomRating.VERY_GOOD),
            ],
        )

        asc = await _get_pages(
            client, admin_headers, _ROOM_URL, "sortField=level&sortOrder=asc", size=2
        )
        desc = await _get_pages(
            client, admin_headers, _ROOM_URL, "sortField=level&sortOrder=desc", size=2
        )

        expected = ["star1", "star2", "star3", "star4", "star5"]
        assert [i["room"]["name"] for i in asc] == expected
        assert [i["room"]["name"] for i in desc] == expected[::-1]
