import json

import pytest

from tests.conftest import ScriptedLlmClient
from waha_emulator.llm.base import ChatMessage
from waha_emulator.sessions import SlotFile
from waha_emulator.workflows.base import WorkflowError, WorkflowRequest
from waha_emulator.workflows.chat import ChatWorkflow


def _request(**slots: bytes) -> WorkflowRequest:
    return WorkflowRequest(
        service_id="svc",
        params={},
        inputs={
            name: SlotFile(name, "text/plain", data) for name, data in slots.items()
        },
        stream=None,
    )


async def test_history_is_passed_before_question() -> None:
    """履歴の役割を小文字にして質問の前に渡し、役割のないものは除くこと"""
    llm = ScriptedLlmClient()
    history = [
        {"role": "SYSTEM", "content": "あなたは助手です"},
        {"role": "USER", "content": "前の質問"},
        {"role": "ASSISTANT", "content": "前の回答"},
        {"role": None, "content": "役割なし"},
    ]

    await ChatWorkflow(llm).run(
        _request(
            question="今回の質問".encode(),
            history=json.dumps(history, ensure_ascii=False).encode(),
        )
    )

    assert llm.received == [
        [
            ChatMessage(role="system", content="あなたは助手です"),
            ChatMessage(role="user", content="前の質問"),
            ChatMessage(role="assistant", content="前の回答"),
            ChatMessage(role="user", content="今回の質問"),
        ]
    ]


async def test_invalid_history_fails() -> None:
    """履歴が JSON でなければ WorkflowError になること"""
    with pytest.raises(WorkflowError, match="history"):
        await ChatWorkflow(ScriptedLlmClient()).run(
            _request(question=b"q", history=b"not json")
        )


async def test_output_matches_retrieval_answer_format() -> None:
    """出力が移植元の RetrievalAnswer と同じ形の JSON であること"""
    output = await ChatWorkflow(ScriptedLlmClient(deltas=["回", "答"])).run(
        _request(question=b"q", textdata=b'{"createLibrary":false}')
    )

    assert json.loads(output) == {"answer": "回答", "filepaths": [], "references": []}
