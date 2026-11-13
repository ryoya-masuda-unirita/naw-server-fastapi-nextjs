"""仮のチャット用ワークフロー（質問を LLM に 1 回渡して回答を返す）。

後続の Issue で生成AIアダプタを移植したら、これと差し替える。
"""

import json
import logging
from collections.abc import Mapping
from typing import Any

from waha_emulator.llm.base import ChatMessage, LlmClient, Role
from waha_emulator.sessions import SLOT_HISTORY, SLOT_QUESTION, SLOT_TEXTDATA, SlotFile
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest

logger = logging.getLogger(__name__)

# server-local の histories.json の type（HistoryMessageContentType）→ LLM の役割
HISTORY_ROLES: dict[str, Role] = {
    "SYSTEM": "system",
    "USER": "user",
    "ASSISTANT": "assistant",
}
QUESTION_MISSING_MESSAGE = (
    "question がありません。チャット以外のサービス（学習データの削除など）は未対応です"
)
CREATE_LIBRARY_UNSUPPORTED_MESSAGE = "ライブラリ生成（createLibrary）は未対応です"


def _decode(slot: SlotFile, name: str) -> str:
    try:
        return slot.data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise WorkflowError(f"{name} が UTF-8 ではありません") from e


def _load_json(slot: SlotFile, name: str) -> Any:
    try:
        return json.loads(_decode(slot, name))
    except json.JSONDecodeError as e:
        raise WorkflowError(f"{name} が JSON ではありません: {e}") from e


def _read_history(inputs: Mapping[str, SlotFile]) -> list[ChatMessage]:
    """server-local の histories.json（`[{"role", "content"}]`）を読む。

    role が null・不明なものは LLM に渡せないため除く。
    """
    slot = inputs.get(SLOT_HISTORY)
    if slot is None:
        return []
    items = _load_json(slot, SLOT_HISTORY)
    if not isinstance(items, list):
        raise WorkflowError(f"{SLOT_HISTORY} が配列ではありません")
    messages: list[ChatMessage] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        role = HISTORY_ROLES.get(str(item.get("role")).upper())
        if role is None:
            continue
        content = item.get("content")
        messages.append(
            ChatMessage(role=role, content=content if isinstance(content, str) else "")
        )
    return messages


def _check_text_data(inputs: Mapping[str, SlotFile]) -> None:
    slot = inputs.get(SLOT_TEXTDATA)
    if slot is None:
        return
    text_data = _load_json(slot, SLOT_TEXTDATA)
    if not isinstance(text_data, dict):
        raise WorkflowError(f"{SLOT_TEXTDATA} がオブジェクトではありません")
    if text_data.get("createLibrary") is True:
        raise WorkflowError(CREATE_LIBRARY_UNSUPPORTED_MESSAGE)
    if text_data.get("tools"):
        # 土台では LLM にツールを渡さない。回答は返せるため失敗にはしない
        logger.warning("tools は未対応のため使わずに回答します: %s", text_data["tools"])


class ChatWorkflow:
    def __init__(self, llm: LlmClient) -> None:
        self._llm = llm

    async def run(self, request: WorkflowRequest) -> str:
        question_slot = request.inputs.get(SLOT_QUESTION)
        if question_slot is None:
            raise WorkflowError(QUESTION_MISSING_MESSAGE)
        question = _decode(question_slot, SLOT_QUESTION)
        _check_text_data(request.inputs)
        messages = [
            *_read_history(request.inputs),
            ChatMessage(role="user", content=question),
        ]

        parts: list[str] = []
        async for delta in self._llm.stream_chat(messages):
            if not delta:
                continue
            parts.append(delta)
            if request.stream is not None:
                request.stream.write_event({"type": "text_delta", "text": delta})

        # 移植元アダプタの RetrievalAnswer（チャットでは filepaths・references が空）
        answer = {"answer": "".join(parts), "filepaths": [], "references": []}
        return json.dumps(answer, ensure_ascii=False)
