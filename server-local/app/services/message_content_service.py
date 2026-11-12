import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.waha_client import SLOT_OUTPUT, WahaClient
from app.core.errors import BadRequestError, EntityNotFoundError
from app.core.ids import create_unique_id
from app.models import MessageContent, MessageContentFile, MessageContentStatus
from app.repositories import message_content_repository
from app.schemas.message import (
    CreateMessageContentCommand,
    RetrievalAnswer,
    UploadedFile,
    create_message_content_response,
    get_message_contents_response,
)
from app.services.waha_inputs import upload_question_history_and_attachment

logger = logging.getLogger(__name__)

# 添付ファイルの Content-Type が不明な場合の値（type 列は NOT NULL のため）
UNKNOWN_CONTENT_TYPE = "application/octet-stream"
UNKNOWN_FILENAME = ""


def validate_target(command: CreateMessageContentCommand) -> None:
    """生成要求に対象（メッセージ ID かメッセージ内容 ID）が指定されているかを検証する。

    新規質問・質問の再生成ではメッセージ ID、回答の再生成ではメッセージ内容 ID を
    指定する。どちらもなければ保存先が決まらないため 400 にする。

    Parameters
    ----------
    command : CreateMessageContentCommand
        メッセージ内容の生成要求。

    Raises
    ------
    BadRequestError
        メッセージ ID とメッセージ内容 ID のどちらも指定されていない場合。
    """
    # 新規質問・質問再生成: messageId のみ / 回答再生成: messageContentId のみ
    if command.message_id is None and command.message_content_id is None:
        raise BadRequestError("対象データが指定されていません")


async def save_attachment_files(
    session: AsyncSession, message_content_id: str, files: list[UploadedFile]
) -> list[MessageContentFile]:
    """質問の添付ファイルをメッセージ内容に紐づけてセッションに追加する。

    ID は既存と重ならないものを採番する。ファイル名・Content-Type が不明な場合は、
    列が NOT NULL のため空文字列・`application/octet-stream` で保存する。
    コミットは呼び出し側で行う。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    message_content_id : str
        紐づけるメッセージ内容 ID。
    files : list[UploadedFile]
        アップロードされた添付ファイル。

    Returns
    -------
    list[MessageContentFile]
        追加した添付ファイルのエンティティ（渡した順）。
    """
    saved: list[MessageContentFile] = []
    for file in files:
        file_id = await create_unique_id(
            lambda candidate: message_content_repository.file_exists_by_id(
                session, candidate
            )
        )
        entity = MessageContentFile(
            id=file_id,
            message_content_id=message_content_id,
            name=file.filename or UNKNOWN_FILENAME,
            type=file.content_type or UNKNOWN_CONTENT_TYPE,
            data=file.data,
        )
        session.add(entity)
        saved.append(entity)
    return saved


async def post_message_content(
    session: AsyncSession, waha: WahaClient, command: CreateMessageContentCommand
) -> dict[str, Any]:
    """移植元 MessageContentService.postMessageContent（content/sync）。

    Waha! のセッションで回答を同期的に生成し、結果をメッセージ内容として保存する。
    メッセージ内容 ID の指定があれば既存のレコードを上書きし（回答の再生成）、
    なければ新しく登録して添付ファイルも保存する。移植元どおり、Waha! 側の失敗は
    例外にせず、エラー内容を回答にして `ERROR` 状態で保存して返す。Waha! の
    セッションは成否に関わらず終了する。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    waha : WahaClient
        Waha! の API クライアント。
    command : CreateMessageContentCommand
        メッセージ内容の生成要求。

    Returns
    -------
    dict[str, Any]
        保存したメッセージ内容のレスポンス（添付ファイルを含む）。

    Raises
    ------
    BadRequestError
        生成の対象が指定されていない場合。
    EntityNotFoundError
        指定したメッセージ内容 ID のレコードがない場合。
    """
    validate_target(command)
    message_id = command.message_id
    existing: MessageContent | None = None
    if command.message_content_id is not None:
        existing = await message_content_repository.find_by_id(
            session, command.message_content_id
        )
        if existing is None:
            raise EntityNotFoundError("対象データが見つかりません")
        message_id = existing.message_id

    answer_text: str | None
    context: str | None = None
    reference_paths: list[str] | None = []
    status = MessageContentStatus.OK

    session_id = await waha.start_session()
    try:
        await upload_question_history_and_attachment(waha, command, session_id)
        await waha.execute(session_id, command.assistant_id or "")
        await waha.get_results(session_id)
        response = await waha.download_file(session_id, SLOT_OUTPUT)
        answer = RetrievalAnswer.model_validate_json(response)
        answer_text = answer.answer
        if answer.references:
            context = answer.context_text()
            reference_paths = answer.filepaths
    except Exception as e:  # noqa: BLE001
        # 移植元どおり、Waha! 側の失敗は例外にせず ERROR 状態で保存して返す
        logger.warning("Waha job failed: %s", e)
        answer_text = str(e)
        status = MessageContentStatus.ERROR
    finally:
        await waha.end_session(session_id)

    if existing is not None:
        existing.status = status.value
        existing.answer = answer_text or ""
        existing.context = context
        existing.set_reference_file_paths(reference_paths)
        existing.touch()
        await session.commit()
        files_by_id = await message_content_repository.find_files_by_content_ids(
            session, [existing.id]
        )
        return create_message_content_response(existing, files_by_id[existing.id])

    content_id = await create_unique_id(
        lambda candidate: message_content_repository.exists_by_id(session, candidate)
    )
    content = MessageContent(
        id=content_id,
        message_id=message_id or "",
        status=status.value,
        question=command.user_input or "",
        answer=answer_text or "",
        context=context,
    )
    content.set_reference_file_paths(reference_paths)
    session.add(content)
    await session.flush()
    files = await save_attachment_files(session, content.id, command.attachment_files)
    await session.commit()
    return create_message_content_response(content, files)


async def get_message_contents_by_message_ids(
    session: AsyncSession, message_ids: list[str]
) -> list[dict[str, Any]]:
    """複数のメッセージ ID に対応するメッセージ内容を、添付ファイル付きで取得する。

    添付ファイルは N+1 にならないよう一括で取得して組み合わせる。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    message_ids : list[str]
        メッセージ ID の一覧。

    Returns
    -------
    list[dict[str, Any]]
        メッセージ内容のレスポンスの一覧。対応するレコードがない ID は含まない。
    """
    contents = await message_content_repository.find_by_message_ids(
        session, message_ids
    )
    files_by_id = await message_content_repository.find_files_by_content_ids(
        session, [c.id for c in contents]
    )
    return [get_message_contents_response(c, files_by_id[c.id]) for c in contents]


async def delete_message_content(session: AsyncSession, message_id: str) -> None:
    """メッセージ ID に対応するメッセージ内容と添付ファイルを削除してコミットする。

    対応するレコードがなくてもエラーにしない。

    Parameters
    ----------
    session : AsyncSession
        DB セッション。
    message_id : str
        メッセージ ID。
    """
    await message_content_repository.delete_by_message_id(session, message_id)
    await session.commit()
