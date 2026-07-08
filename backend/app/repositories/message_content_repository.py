from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import MessageContent, MessageFile


class MessageContentRepository:
    @staticmethod
    async def find_by_message_id_in(
        message_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> list[MessageContent]:
        """メッセージID一覧に対応するメッセージ内容を1クエリで取得する。

        Args:
            message_ids: 取得対象のメッセージID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            メッセージ内容一覧。
        """
        if not message_ids:
            return []
        stmt = select(MessageContent).where(
            MessageContent.message_id.in_(message_ids),
            MessageContent.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def find_attachment_files_grouped_by_content_ids(
        message_content_ids: list[str], tenant_id: str, session: AsyncSession
    ) -> dict[str, list[MessageFile]]:
        """メッセージ内容ID一覧に対応する添付ファイルを1クエリでまとめて取得する。

        Args:
            message_content_ids: 対象のメッセージ内容ID一覧。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            メッセージ内容IDをキーとした添付ファイル一覧の辞書。
        """
        grouped: dict[str, list[MessageFile]] = {
            content_id: [] for content_id in message_content_ids
        }
        if not message_content_ids:
            return grouped
        stmt = select(MessageFile).where(
            MessageFile.message_id.in_(message_content_ids),
            MessageFile.tenant_id == tenant_id,
        )
        result = await session.execute(stmt)
        for file in result.scalars().all():
            grouped[file.message_id].append(file)
        return grouped
