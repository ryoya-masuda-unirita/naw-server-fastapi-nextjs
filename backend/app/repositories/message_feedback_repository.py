from sqlalchemy import and_, case, func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageContent, MessageFeedback
from app.models.room import Room, RoomRating
from app.models.user import User

_RESPONSE_STATUS_HAS_RESPONSE = "has_response"
_RESPONSE_STATUS_NO_RESPONSE = "no_response"
_SATISFACTION_COLUMN_BY_STAR = {
    "star5": "excellent",
    "star4": "very_good",
    "star3": "good",
    "star2": "average",
    "star1": "poor",
}


class MessageFeedbackRepository:
    @staticmethod
    async def find_by_ids_and_tenant_id(
        feedback_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[MessageFeedback]:
        """フィードバックID一覧とテナントIDでフィードバック一覧を取得する。"""
        if not feedback_ids:
            return []
        stmt = select(MessageFeedback).where(
            MessageFeedback.id.in_(feedback_ids),
            MessageFeedback.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_by_tenant_id_and_message_id(
        tenant_id: str, message_id: str, session: AsyncSession
    ) -> MessageFeedback | None:
        """メッセージIDとテナントIDでフィードバックを取得する。

        Args:
            tenant_id: テナントID。
            message_id: 対象のメッセージID。
            session: 非同期DBセッション。

        Returns:
            該当するフィードバック。存在しない場合はNone。
        """
        stmt = select(MessageFeedback).where(
            MessageFeedback.tenant_id == tenant_id,
            MessageFeedback.message_id == message_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_message_ids_with_feedback(
        message_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> set[str]:
        """フィードバックが登録済みのメッセージID集合を1クエリで取得する。

        Args:
            message_ids: 判定対象のメッセージID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            フィードバックが登録済みのメッセージID集合。
        """
        if not message_ids:
            return set()
        stmt = select(MessageFeedback.message_id).where(
            MessageFeedback.message_id.in_(message_ids),
            MessageFeedback.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return set(result.scalars().all())

    @staticmethod
    async def find_feedback_messages(
        tenant_id: str,
        assistant_id: str | None,
        rating: str | None,
        folder_id: str | None,
        sort_column: str,
        sort_desc: bool,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Row], int]:
        """フィードバックメッセージ一覧を取得する。"""
        stmt = (
            select(
                MessageFeedback.id.label("feedback_id"),
                MessageFeedback.tenant_id.label("tenant_id"),
                MessageFeedback.user_id.label("user_id"),
                MessageFeedback.message_id.label("message_id"),
                Message.assistant_id.label("assistant_id"),
                MessageContent.question.label("question"),
                MessageContent.answer.label("answer"),
                MessageFeedback.rating.label("rating"),
                MessageFeedback.index_id.label("index_id"),
                MessageFeedback.created_at.label("created_at"),
                MessageFeedback.updated_at.label("updated_at"),
            )
            .select_from(MessageFeedback)
            .outerjoin(
                Message,
                and_(
                    Message.id == MessageFeedback.message_id,
                    Message.tenant_id == tenant_id,
                ),
            )
            .outerjoin(
                MessageContent,
                and_(
                    MessageContent.message_id == Message.id,
                    MessageContent.tenant_id == tenant_id,
                ),
            )
            .where(MessageFeedback.tenant_id == tenant_id)
        )

        if assistant_id is not None:
            stmt = stmt.where(Message.assistant_id == assistant_id)
        if rating is not None:
            stmt = stmt.where(MessageFeedback.rating == rating)
        if folder_id is not None:
            stmt = stmt.where(MessageFeedback.index_id == folder_id)

        total = (
            await session.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar() or 0

        if sort_column == "assistant_id":
            order_col = Message.assistant_id
        elif sort_column == "rating":
            order_col = MessageFeedback.rating
        elif sort_column == "index_id":
            order_col = MessageFeedback.index_id
        else:
            order_col = MessageFeedback.updated_at

        stmt = stmt.order_by(order_col.desc() if sort_desc else order_col.asc())
        stmt = stmt.offset(page * size).limit(size)
        result = await session.execute(stmt)
        return list(result.all()), total

    @staticmethod
    async def find_feedback_users(
        tenant_id: str,
        response_status: str | None,
        satisfaction: str | None,
        sort_column: str,
        sort_desc: bool,
        page: int,
        size: int,
        session: AsyncSession,
    ) -> tuple[list[Row], int]:
        """テナント内の全ユーザーについて、フィードバック件数とルーム満足度別件数を集計する。

        `message_feedbacks`（メッセージへの評価）と`rooms`（ルームの満足度評価）は
        それぞれユーザーに対する独立した`LEFT JOIN`であり、両者を紐付ける結合条件がない。
        そのため、あるユーザーが複数件のメッセージフィードバックと複数件の評価済みルームを
        両方持つ場合、集計前の行数はその直積になり、満足度別件数が実際のルーム評価件数より
        過大にカウントされ得る。これは移植元（Spring Boot）のネイティブSQLと同一の挙動であり、
        本実装ではその仕様をそのまま踏襲する。

        Args:
            tenant_id: テナントID。
            response_status: `has_response`/`no_response`のいずれか、または絞り込みなしのNone。
            satisfaction: `star1`〜`star5`のいずれか、または絞り込みなしのNone。
            sort_column: ソート対象カラム名（`display_name`/`feedback_message_count`/
                `latest_updated_at`/`excellent`/`very_good`/`good`/`average`/`poor`のいずれか）。
            sort_desc: 降順ならTrue。
            page: ページ番号（0始まり）。
            size: 1ページあたりの件数。
            session: 非同期DBセッション。

        Returns:
            (集計結果の行一覧, 絞り込み後の総件数) のタプル。
        """
        stats = (
            select(
                User.id.label("user_id"),
                User.login_id.label("login_id"),
                User.name.label("display_name"),
                func.count(func.distinct(MessageFeedback.id)).label(
                    "feedback_message_count"
                ),
                func.coalesce(
                    func.max(MessageFeedback.updated_at), User.updated_at
                ).label("latest_updated_at"),
                func.count(case((Room.rating == RoomRating.EXCELLENT, 1))).label(
                    "excellent"
                ),
                func.count(case((Room.rating == RoomRating.VERY_GOOD, 1))).label(
                    "very_good"
                ),
                func.count(case((Room.rating == RoomRating.GOOD, 1))).label("good"),
                func.count(case((Room.rating == RoomRating.AVERAGE, 1))).label(
                    "average"
                ),
                func.count(case((Room.rating == RoomRating.POOR, 1))).label("poor"),
            )
            .select_from(User)
            .outerjoin(
                MessageFeedback,
                and_(
                    MessageFeedback.user_id == User.id,
                    MessageFeedback.tenant_id == tenant_id,
                ),
            )
            .outerjoin(Room, and_(Room.user_id == User.id, Room.tenant_id == tenant_id))
            .where(User.tenant_id == tenant_id)
            .group_by(User.id, User.login_id, User.name, User.updated_at)
            .cte("feedback_user_stats")
        )

        filters = []
        if response_status == _RESPONSE_STATUS_HAS_RESPONSE:
            filters.append(stats.c.feedback_message_count > 0)
        elif response_status == _RESPONSE_STATUS_NO_RESPONSE:
            filters.append(stats.c.feedback_message_count == 0)
        if satisfaction is not None:
            satisfaction_column = getattr(
                stats.c, _SATISFACTION_COLUMN_BY_STAR[satisfaction]
            )
            filters.append(satisfaction_column > 0)

        filtered_stmt = select(stats).where(*filters)
        total = (
            await session.execute(
                select(func.count()).select_from(filtered_stmt.subquery())
            )
        ).scalar() or 0

        order_column = getattr(stats.c, sort_column)
        rows_stmt = (
            filtered_stmt.order_by(
                order_column.desc() if sort_desc else order_column.asc()
            )
            .offset(page * size)
            .limit(size)
        )
        result = await session.execute(rows_stmt)
        return list(result.all()), total

    @staticmethod
    async def save(feedback: MessageFeedback, session: AsyncSession) -> MessageFeedback:
        """フィードバックを新規作成または更新する。

        Args:
            feedback: 保存対象のフィードバック（新規または既存インスタンス）。
            session: 非同期DBセッション。

        Returns:
            保存後のフィードバック。
        """
        session.add(feedback)
        await session.commit()
        await session.refresh(feedback)
        return feedback
