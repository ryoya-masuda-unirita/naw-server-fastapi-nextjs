from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import MessageFeedback


class MessageFeedbackRepository:
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
