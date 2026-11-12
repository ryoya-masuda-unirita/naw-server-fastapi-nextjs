from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MessageContent, MessageContentFile


async def find_by_id(session: AsyncSession, content_id: str) -> MessageContent | None:
    """ID でメッセージ内容を取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    content_id : str
        メッセージ内容 ID。

    Returns
    -------
    MessageContent | None
        見つかったメッセージ内容。なければ None。
    """
    return await session.get(MessageContent, content_id)


async def exists_by_id(session: AsyncSession, content_id: str) -> bool:
    """指定した ID のメッセージ内容が登録済みかを判定する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    content_id : str
        メッセージ内容 ID。

    Returns
    -------
    bool
        登録済みなら True。
    """
    return await session.get(MessageContent, content_id) is not None


async def file_exists_by_id(session: AsyncSession, file_id: str) -> bool:
    """指定した ID の添付ファイルが登録済みかを判定する。

    添付ファイルの ID は呼び出し側が指定するため、保存前に重複を確かめるために使う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    file_id : str
        添付ファイル ID。

    Returns
    -------
    bool
        登録済みなら True。
    """
    return await session.get(MessageContentFile, file_id) is not None


async def find_by_message_ids(
    session: AsyncSession, message_ids: list[str]
) -> list[MessageContent]:
    """複数のメッセージ ID に対応するメッセージ内容をまとめて取得する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    message_ids : list[str]
        メッセージ ID の一覧。

    Returns
    -------
    list[MessageContent]
        見つかったメッセージ内容の一覧（順序は保証しない）。空の一覧を渡すと
        問い合わせずに空リストを返す。
    """
    if not message_ids:
        return []
    result = await session.execute(
        select(MessageContent).where(MessageContent.message_id.in_(message_ids))
    )
    return list(result.scalars().all())


async def find_files_by_content_ids(
    session: AsyncSession, content_ids: list[str]
) -> dict[str, list[MessageContentFile]]:
    """添付ファイルをメッセージ内容 ID ごとにまとめて返す（N+1 を避けるため一括取得）。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    content_ids : list[str]
        メッセージ内容 ID の一覧。

    Returns
    -------
    dict[str, list[MessageContentFile]]
        メッセージ内容 ID ごとの添付ファイル一覧（作成日時の昇順）。添付がない
        メッセージ内容も空リストで含める。
    """
    grouped: dict[str, list[MessageContentFile]] = {cid: [] for cid in content_ids}
    if not content_ids:
        return grouped
    result = await session.execute(
        select(MessageContentFile)
        .where(MessageContentFile.message_content_id.in_(content_ids))
        .order_by(MessageContentFile.created_at)
    )
    for file in result.scalars().all():
        grouped[file.message_content_id].append(file)
    return grouped


async def delete_by_message_id(session: AsyncSession, message_id: str) -> None:
    """メッセージ ID に対応するメッセージ内容を削除する。

    添付ファイルは外部キーの ON DELETE CASCADE で一緒に消える。コミットは
    呼び出し側で行う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    message_id : str
        メッセージ ID。
    """
    # 添付ファイルは外部キーの ON DELETE CASCADE で一緒に消える
    await session.execute(
        delete(MessageContent).where(MessageContent.message_id == message_id)
    )
