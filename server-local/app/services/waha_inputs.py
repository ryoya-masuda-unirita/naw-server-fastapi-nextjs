"""メッセージ生成で Waha! に送る入力ファイル（質問・履歴・添付）のアップロード。

同期 API（content/sync）と SSE（content・content/stream）で同じ処理のため共通化する。
"""

import logging

from app.clients.waha_client import (
    SLOT_ATTACHMENT,
    SLOT_HISTORY,
    SLOT_QUESTION,
    WahaClient,
)
from app.core.jsonutil import to_compact_json
from app.schemas.message import CreateMessageContentCommand

logger = logging.getLogger(__name__)

QUESTION_FILENAME = "question.txt"
HISTORY_FILENAME = "histories.json"
ATTACHMENT_FALLBACK_FILENAME = "attachment"


async def upload_question_history_and_attachment(
    waha: WahaClient, command: CreateMessageContentCommand, session_id: str
) -> None:
    await waha.upload_file(
        filename=QUESTION_FILENAME,
        content=command.question_text().encode("utf-8"),
        slot=SLOT_QUESTION,
        session_id=session_id,
    )

    if command.history_messages:
        # 移植元 MessageHistoryContent（role / content）の配列
        histories = [
            {"role": m.type.value, "content": m.content}
            for m in command.history_messages
        ]
        json_data = to_compact_json(histories)
        logger.info(
            "Preparing histories.json: wahaSessionId=%s, filename=%s, slot=%s, "
            "content=%s",
            session_id,
            HISTORY_FILENAME,
            SLOT_HISTORY,
            json_data,
        )
        await waha.upload_file(
            filename=HISTORY_FILENAME,
            content=json_data.encode("utf-8"),
            slot=SLOT_HISTORY,
            session_id=session_id,
        )

    # 移植元どおり、Waha! に渡す添付は先頭 1 件のみ。履歴の添付ファイルは使わない
    if command.attachment_files:
        first = command.attachment_files[0]
        await waha.upload_file(
            filename=first.filename or ATTACHMENT_FALLBACK_FILENAME,
            content=first.data,
            slot=SLOT_ATTACHMENT,
            session_id=session_id,
            content_type=first.content_type,
        )
