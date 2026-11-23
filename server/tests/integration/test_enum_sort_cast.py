"""ネイティブENUM列での並べ替えが、移植元と同じ文字列順になるSQLを発行することの確認。

テストDBはインメモリSQLiteで、ENUMを文字列で持つため、並べ替えの結果では
ENUMの宣言順と文字列順の差が出ない。各一覧が実際に発行する文を捕捉し、
PostgreSQL方言でコンパイルした並べ替え句に文字列へのキャストが入っていることを確かめる。
"""

from collections.abc import Awaitable, Callable
from typing import Any, cast

import pytest
from sqlalchemy import event
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import ORMExecuteState
from sqlalchemy.sql.elements import ClauseElement

from app.core.sort import SortOrder
from app.repositories.assistant_repository import AssistantRepository
from app.repositories.group_assistant_repository import GroupAssistantRepository
from app.repositories.index_repository import IndexRepository
from app.repositories.message_feedback_repository import MessageFeedbackRepository
from app.repositories.room_repository import RoomRepository

_TENANT_ID = "tenant-enum-sort-cast-test"
_ORDER_BY = "ORDER BY "


async def _order_by_sql(
    session: AsyncSession, run: Callable[[], Awaitable[Any]]
) -> str:
    """一覧を実行し、発行された並べ替え付きの文の ORDER BY 以降をPostgreSQL方言で返す。"""
    statements: list[ClauseElement] = []

    def _capture(state: ORMExecuteState) -> None:
        """実行された文を記録する。

        Parameters
        ----------
        state : ORMExecuteState
            ORM実行時の状態。
        """
        # 実行時は句要素だが、`Executable`の型定義はcompile()を持たないため絞り込む
        statements.append(cast(ClauseElement, state.statement))

    event.listen(session.sync_session, "do_orm_execute", _capture)
    try:
        await run()
    finally:
        event.remove(session.sync_session, "do_orm_execute", _capture)

    # 件数取得の文は並べ替えを含まないため、並べ替え付きの文（一覧本体）だけが残る
    compiled = [str(stmt.compile(dialect=postgresql.dialect())) for stmt in statements]
    ordered = [sql for sql in compiled if _ORDER_BY in sql]
    assert len(ordered) == 1
    return ordered[0].split(_ORDER_BY, 1)[1]


class TestAssistantFindPage:
    """アシスタント一覧の並べ替えで列挙型がキャストされることのテスト。"""

    @staticmethod
    def _run(session: AsyncSession, order: SortOrder) -> Callable[[], Awaitable[Any]]:
        """アシスタント一覧の取得を実行する関数を組み立てる。

        Parameters
        ----------
        session : AsyncSession
            DBセッション。
        order : SortOrder
            並べ替え条件。

        Returns
        -------
        Callable[[], Awaitable[Any]]
            一覧取得を実行する引数なしの非同期関数。
        """
        return lambda: AssistantRepository.find_page(
            tenant_id=_TENANT_ID,
            search=None,
            assistant_type=None,
            category_id=None,
            group_id=None,
            exclude_group_id=None,
            allowed_group_ids=None,
            sort=[order],
            page=0,
            size=20,
            session=session,
        )

    @pytest.mark.parametrize("key", ["type", "assistantType", "serverType", "server"])
    async def test_type_sort_casts_to_varchar(
        self, session: AsyncSession, key: str
    ) -> None:
        """種別での並べ替えがENUMの宣言順ではなく文字列順になるようキャストされること"""
        sql = await _order_by_sql(session, self._run(session, SortOrder(key)))

        assert sql.startswith("CAST(assistants.type AS VARCHAR) ASC")

    async def test_type_sort_descending_casts_to_varchar(
        self, session: AsyncSession
    ) -> None:
        """種別の降順も文字列にキャストした列で並べること"""
        sql = await _order_by_sql(
            session, self._run(session, SortOrder("type", descending=True))
        )

        assert sql.startswith("CAST(assistants.type AS VARCHAR) DESC")


class TestIndexFindPage:
    """インデックス一覧の並べ替えで列挙型がキャストされることのテスト。"""

    async def test_type_sort_casts_to_varchar(self, session: AsyncSession) -> None:
        """インデックス種別での並べ替えが文字列順になるようキャストされること"""
        sql = await _order_by_sql(
            session,
            lambda: IndexRepository.find_page(
                tenant_id=_TENANT_ID,
                search=None,
                group_id=None,
                allowed_index_ids=None,
                allowed_group_ids=None,
                sort=[SortOrder("type")],
                page=0,
                size=20,
                session=session,
            ),
        )

        assert sql.startswith("CAST(indexes.type AS VARCHAR) ASC")


class TestGroupAssistantFindPageByGroup:
    """グループのアシスタント一覧の並べ替えで列挙型がキャストされることのテスト。"""

    @pytest.mark.parametrize("key", ["type", "server", "assistantType"])
    async def test_type_sort_casts_to_varchar(
        self, session: AsyncSession, key: str
    ) -> None:
        """グループのアシスタント一覧の種別での並べ替えが文字列順になるようキャストされること"""
        sql = await _order_by_sql(
            session,
            lambda: GroupAssistantRepository.find_page_by_group(
                group_id="group-enum-sort-cast-test",
                tenant_id=_TENANT_ID,
                assistant_type=None,
                category_id=None,
                search=None,
                sort=[SortOrder(key)],
                page=0,
                size=20,
                session=session,
            ),
        )

        assert sql.startswith("CAST(assistants.type AS VARCHAR) ASC")


class TestFeedbackRooms:
    """ルームのフィードバック一覧の並べ替えで列挙型がキャストされることのテスト。"""

    async def test_rating_sort_casts_to_varchar(self, session: AsyncSession) -> None:
        """ルームのフィードバック一覧の評価での並べ替えが文字列順になるようキャストされること"""
        sql = await _order_by_sql(
            session,
            lambda: RoomRepository.find_feedback_rooms(
                tenant_id=_TENANT_ID,
                assistant_id=None,
                rating=None,
                sort_column="rating",
                sort_desc=False,
                page=0,
                size=20,
                session=session,
            ),
        )

        assert sql.startswith("CAST(rooms.rating AS VARCHAR) ASC")


class TestFeedbackMessages:
    """メッセージのフィードバック一覧の並べ替えで列挙型がキャストされることのテスト。"""

    async def test_rating_sort_casts_to_varchar(self, session: AsyncSession) -> None:
        """メッセージのフィードバック一覧の評価での並べ替えが文字列順になるようキャストされること"""
        sql = await _order_by_sql(
            session,
            lambda: MessageFeedbackRepository.find_feedback_messages(
                tenant_id=_TENANT_ID,
                assistant_id=None,
                rating=None,
                folder_id=None,
                sort_column="rating",
                sort_desc=False,
                page=0,
                size=20,
                session=session,
            ),
        )

        assert sql.startswith("CAST(message_feedbacks.rating AS VARCHAR) ASC")
