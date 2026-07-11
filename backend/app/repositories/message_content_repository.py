from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import MessageContent, MessageContentStatus, MessageFile


class MessageContentRepository:
    @staticmethod
    async def save(content: MessageContent, session: AsyncSession) -> MessageContent:
        """メッセージ内容を新規追加してコミットする。

        メッセージ送信(SSEストリーミング)完了後の永続化は、リクエストのDIスコープとは
        独立した新規セッションで行われるため、呼び出し元は保存専用のセッションを渡すこと。

        Args:
            content: 保存対象のメッセージ内容。
            session: 非同期DBセッション。

        Returns:
            保存後のメッセージ内容（DBが払い出した値を反映済み）。
        """
        session.add(content)
        await session.commit()
        await session.refresh(content)
        return content

    @staticmethod
    async def find_by_id_and_tenant_id(
        content_id: str, tenant_id: str, session: AsyncSession
    ) -> MessageContent | None:
        """メッセージ内容IDとテナントIDから対象を1件取得する（再生成対象の解決用）。

        Args:
            content_id: メッセージ内容ID。
            tenant_id: テナントID。
            session: 非同期DBセッション。

        Returns:
            該当するメッセージ内容。存在しない場合はNone。
        """
        stmt = select(MessageContent).where(
            MessageContent.id == content_id, MessageContent.tenant_id == tenant_id
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_answer(
        content: MessageContent,
        *,
        status: MessageContentStatus,
        answer: str,
        context: str | None,
        file_paths: str | None,
        session: AsyncSession,
    ) -> MessageContent:
        """既存のメッセージ内容を再生成結果で上書き保存する（`question`は変更しない）。

        Args:
            content: 更新対象のメッセージ内容（同一セッションで取得済みのもの）。
            status: 更新後のステータス。
            answer: 更新後の回答本文。
            context: 更新後のRAGコンテキスト（SAAS_CHATの場合はNone）。
            file_paths: 更新後の参照ファイルパス（カンマ区切り文字列）。
            session: 非同期DBセッション。

        Returns:
            更新後のメッセージ内容。
        """
        content.status = status
        content.answer = answer
        content.context = context
        content.file_paths = file_paths
        session.add(content)
        await session.commit()
        await session.refresh(content)
        return content

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
