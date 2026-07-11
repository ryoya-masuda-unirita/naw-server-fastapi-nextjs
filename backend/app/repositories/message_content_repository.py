from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import MessageContent, MessageFile


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

    @staticmethod
    async def save_attachment_files(
        files: list[MessageFile], session: AsyncSession
    ) -> list[MessageFile]:
        """メッセージ内容に紐づく添付ファイルをまとめて新規追加してコミットする。

        `session.add`をループで呼んでも、SQLAlchemyの`insertmanyvalues`により
        commit時に1回のINSERT(またはバッチ化されたexecutemany)にまとめられるため、
        N回のラウンドトリップにはならない。`id`は`default_factory`でPython側が
        払い出し、`name`/`type`/`data`も挿入前に確定済みで、呼び出し元は
        `created_at`/`updated_at`(サーバー側生成値)を参照しないため、`refresh`は
        あえて行わない（行うとファイル数分のSELECTが発生しN+1になる）。

        Args:
            files: 保存対象の添付ファイル一覧。
            session: 非同期DBセッション。

        Returns:
            保存後の添付ファイル一覧。
        """
        for file in files:
            session.add(file)
        await session.commit()
        return files
