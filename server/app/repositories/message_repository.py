from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageContent, MessageFeedback


class MessageRepository:
    """メッセージのDBアクセスをまとめたリポジトリ。"""

    @staticmethod
    async def find_by_tenant_id_and_id(
        tenant_id: str, message_id: str, session: AsyncSession
    ) -> Message | None:
        """メッセージIDとテナントIDでメッセージを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        message_id : str
            対象のメッセージID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Message | None
            該当するメッセージ。存在しない場合はNone。
        """
        stmt = select(Message).where(
            Message.id == message_id, Message.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def find_by_tenant_id_and_content_id(
        tenant_id: str, message_content_id: str, session: AsyncSession
    ) -> Message | None:
        """メッセージ内容IDから、それが属するメッセージを取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        message_content_id : str
            対象のメッセージ内容ID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        Message | None
            該当するメッセージ。存在しない場合はNone。
        """
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
        """メッセージID一覧とテナントIDでメッセージ一覧を1クエリで取得する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        message_ids : list[str]
            取得対象のメッセージID一覧。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[Message]
            メッセージ一覧。
        """
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
        """メッセージIDとテナントIDでメッセージが存在するかを判定する。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        message_id : str
            対象のメッセージID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        bool
            存在すればTrue。
        """
        stmt = select(Message.id).where(
            Message.id == message_id, Message.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalars().first() is not None

    @staticmethod
    async def find_by_tenant_id_and_room_id_with_feedback(
        tenant_id: str, room_id: str, session: AsyncSession
    ) -> list[tuple[Message, MessageFeedback | None]]:
        """指定ルームのメッセージ一覧を、フィードバックとあわせて1クエリで取得する。

        やり取りの作成が古い順（メッセージ内容の作成日時の昇順）に返す。編集・再生成で同じ親から
        分かれた版の「最新」を、呼び出し側が配列の末尾から一貫して選べるようにするため。
        ``messages`` には作成日時の列が無いので、``message_contents`` の作成日時で並べる。
        内容がまだ無いメッセージは末尾（NULLの扱いはDBで違うため ``NULLS LAST`` を明示する）、
        同順位はメッセージIDの昇順にして、毎回同じ順序にする。

        Parameters
        ----------
        tenant_id : str
            テナントID。
        room_id : str
            対象のルームID。
        session : AsyncSession
            非同期DBセッション。

        Returns
        -------
        list[tuple[Message, MessageFeedback | None]]
            (メッセージ, フィードバック) のタプル一覧。フィードバック未登録時はNone。
        """
        # メッセージごとの、内容の作成日時。結合せずに相関サブクエリで求めるのは、
        # ``message_contents.message_id`` にDB上の一意制約が無く、結合するとメッセージの行が
        # 重複しうるため（内容が複数ある場合は、最も古い作成日時で並べる）
        content_created_at = (
            select(func.min(MessageContent.created_at))
            .where(
                MessageContent.message_id == Message.id,
                MessageContent.tenant_id == tenant_id,
            )
            .correlate(Message)
            .scalar_subquery()
        )
        stmt = (
            select(Message, MessageFeedback)
            .outerjoin(
                MessageFeedback,
                (MessageFeedback.message_id == Message.id)
                & (MessageFeedback.tenant_id == tenant_id),
            )
            .where(Message.tenant_id == tenant_id, Message.room_id == room_id)
            .order_by(content_created_at.asc().nulls_last(), Message.id.asc())
        )
        result = await session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    @staticmethod
    async def delete(message: Message, session: AsyncSession) -> None:
        """メッセージを削除する。

        子孫メッセージ・メッセージ内容はDBの`ON DELETE CASCADE`に任せるため、
        対象メッセージ本体を1回`DELETE`するだけでよい。

        Parameters
        ----------
        message : Message
            削除対象のメッセージ。
        session : AsyncSession
            非同期DBセッション。
        """
        await session.execute(delete(Message).where(Message.id == message.id))
        await session.commit()
