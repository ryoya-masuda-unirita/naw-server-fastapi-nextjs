import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import MessageContent, MessageContentFile


def multipart_files(
    text_data: dict[str, Any],
    attachments: list[tuple[str, bytes, str]] | None = None,
    history_attachments: list[tuple[str, bytes, str]] | None = None,
) -> list[tuple[str, tuple[str, bytes, str]]]:
    """ブラウザと同じく textData を application/json の Blob として送る multipart を作る。

    フロントは textData を JSON の Blob として送るため、テストでもファイル名 "blob"・
    Content-Type application/json のパートにして、サーバーの受け取り方を本番と揃える。

    Parameters
    ----------
    text_data : dict[str, Any]
        textData パートに入れるリクエスト本文。
    attachments : list[tuple[str, bytes, str]] | None
        attachmentFiles パートに入れる (ファイル名, 中身, Content-Type) のリスト。
    history_attachments : list[tuple[str, bytes, str]] | None
        historyAttachmentFiles パートに入れる (ファイル名, 中身, Content-Type) のリスト。

    Returns
    -------
    list[tuple[str, tuple[str, bytes, str]]]
        httpx の files 引数にそのまま渡せる multipart のパート一覧。
    """
    files: list[tuple[str, tuple[str, bytes, str]]] = [
        (
            "textData",
            ("blob", json.dumps(text_data).encode("utf-8"), "application/json"),
        )
    ]
    for name, data, content_type in attachments or []:
        files.append(("attachmentFiles", (name, data, content_type)))
    for name, data, content_type in history_attachments or []:
        files.append(("historyAttachmentFiles", (name, data, content_type)))
    return files


async def insert_message_content(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    content_id: str,
    message_id: str,
    answer: str = "既存の回答",
    file_paths: str | None = None,
    attachments: list[tuple[str, str, bytes]] | None = None,
) -> None:
    """過去の質問・回答として、完了済み（status=OK）のメッセージ内容を DB に入れる。

    履歴を引き継ぐ処理のテストで、前回の回答や添付ファイルが既にある状態を作るため。
    添付ファイルの ID は content_id から作り、ID の長さの上限に収める。

    Parameters
    ----------
    session_factory : async_sessionmaker[AsyncSession]
        テスト用 DB のセッションファクトリ。
    content_id : str
        メッセージ内容の ID。
    message_id : str
        紐づけるメッセージ ID。
    answer : str
        保存する回答。
    file_paths : str | None
        保存するファイルパス（JSON 文字列）。
    attachments : list[tuple[str, str, bytes]] | None
        添付ファイルの (ファイル名, Content-Type, 中身) のリスト。
    """
    async with session_factory() as session:
        session.add(
            MessageContent(
                id=content_id,
                message_id=message_id,
                status="OK",
                question="既存の質問",
                answer=answer,
                context="既存のコンテキスト",
                file_paths=file_paths,
            )
        )
        await session.flush()
        for index, (name, content_type, data) in enumerate(attachments or []):
            session.add(
                MessageContentFile(
                    id=f"{content_id[:28]}f{index:03d}",
                    message_content_id=content_id,
                    name=name,
                    type=content_type,
                    data=data,
                )
            )
        await session.commit()


def parse_sse(body: str) -> list[dict[str, Any]]:
    """`data:{json}` + 空行の SSE を JSON のリストにする。

    移植元に合わせて `data:` の直後に空白を入れない形式になっていることも同時に検証する。

    Parameters
    ----------
    body : str
        SSE のレスポンス本文。

    Returns
    -------
    list[dict[str, Any]]
        イベントごとの JSON。
    """
    events: list[dict[str, Any]] = []
    for block in body.split("\n\n"):
        if not block:
            continue
        assert block.startswith("data:"), block
        assert not block.startswith("data: "), "data: の後ろに空白を入れない"
        events.append(json.loads(block[len("data:") :]))
    return events
