from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageContent, MessageFeedback


class MessageRepository:
    @staticmethod
    async def find_by_tenant_id_and_id(
        tenant_id: str, message_id: str, session: AsyncSession
    ) -> Message | None:
        """メッセージIDとテナントIDでメッセージを取得する。"""
        stmt = select(Message).where(
            Message.id == message_id, Message.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_tenant_id_and_content_id(
        tenant_id: str, message_content_id: str, session: AsyncSession
    ) -> Message | None:
        """メッセージ内容IDから、それが属するメッセージを取得する。"""
        stmt = (
            select(Message)
            .join(MessageContent, MessageContent.message_id == Message.id)
            .where(
                MessageContent.id == message_content_id,
                Message.tenant_id == tenant_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_tenant_id_and_ids(
        tenant_id: str, message_ids: list[str], session: AsyncSession
    ) -> list[Message]:
        """メッセージID一覧とテナントIDでメッセージ一覧を1クエリで取得する。"""
        if not message_ids:
            return []
        stmt = select(Message).where(
            Message.id.in_(message_ids), Message.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def exists_by_tenant_id_and_id(
        tenant_id: str, message_id: str, session: AsyncSession
    ) -> bool:
        """メッセージIDとテナントIDでメッセージが存在するかを判定する。"""
        stmt = select(Message.id).where(
            Message.id == message_id, Message.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first() is not None

    @staticmethod
    async def find_by_tenant_id_and_room_id_with_feedback(
        tenant_id: str, room_id: str, session: AsyncSession
    ) -> list[tuple[Message, MessageFeedback | None]]:
        """指定ルームのメッセージ一覧を、フィードバックとあわせて1クエリで取得する。"""
        stmt = (
            select(Message, MessageFeedback)
            .outerjoin(
                MessageFeedback,
                (MessageFeedback.message_id == Message.id)
                & (MessageFeedback.tenant_id == tenant_id),
            )
            .where(Message.tenant_id == tenant_id, Message.room_id == room_id)
        )
        result = await session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    @staticmethod
    async def create(message: Message, session: AsyncSession) -> Message:
        """メッセージを新規作成する。"""
        session.add(message)
        await session.commit()
        await session.refresh(message)
        return message

    @staticmethod
    async def delete(message: Message, session: AsyncSession) -> None:
        """メッセージを削除する。

        子孫メッセージ・メッセージ内容はDBの`ON DELETE CASCADE`に任せるため、
        対象メッセージ本体を1回`DELETE`するだけでよい。
        """
        await session.execute(delete(Message).where(Message.id == message.id))
        await session.commit()
