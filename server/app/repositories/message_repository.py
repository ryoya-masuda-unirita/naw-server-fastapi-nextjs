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
        同順位はメッセージIDの昇順にして、毎回同じ順序にする。IDはランダムなので、同順位の並びは
        作成順ではなく、決定的であることだけを保証する（内容の作成日時は、メッセージごとの別の
        トランザクションで付くため、複数のメッセージが同時刻になることは、実際にはほとんど無い）。

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
        # メッセージごとの、内容の作成日時（内容が複数あれば最も古いもの）。ルームのメッセージに絞って
        # 1回だけ集計し、メッセージの行に結合する。``message_contents.message_id`` にDB上の一意制約が
        # 無く、内容を直接結合するとメッセージの行が重複しうるため、``GROUP BY`` で1メッセージ1行にする。
        # メッセージごとの相関サブクエリにしないのは、``message_id`` に索引が無く、メッセージの数だけ
        # ``message_contents`` を走査してしまうため
        first_content = (
            select(
                MessageContent.message_id.label("message_id"),
                func.min(MessageContent.created_at).label("created_at"),
            )
            .where(
                MessageContent.tenant_id == tenant_id,
                MessageContent.message_id.in_(
                    select(Message.id).where(
                        Message.tenant_id == tenant_id, Message.room_id == room_id
                    )
                ),
            )
            .group_by(MessageContent.message_id)
            .subquery()
        )
        stmt = (
            select(Message, MessageFeedback)
            .outerjoin(first_content, first_content.c.message_id == Message.id)
            .outerjoin(
                MessageFeedback,
                (MessageFeedback.message_id == Message.id)
                & (MessageFeedback.tenant_id == tenant_id),
            )
            .where(Message.tenant_id == tenant_id, Message.room_id == room_id)
            .order_by(first_content.c.created_at.asc().nulls_last(), Message.id.asc())
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
