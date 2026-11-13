"""RAG 回答の契約プロンプトの adapter 側の入口のテスト。

移植元: service/RagAnswerContractPromptTest。
Java のクラス修飾子（public final）・戻り値の型の確認は Python にないため、関数が Message を
返すことと、内容が core の契約プロンプトと同じであることを確かめる。
"""

from generative_ai_adapter import rag_prompt
from generative_ai_adapter.domain import Message
from generative_ai_core.chat import rag_prompt as core_rag_prompt


def test_keeps_facade_and_exact_core_contract() -> None:
    """system のメッセージとして core の契約プロンプトをそのまま返すこと"""
    message = rag_prompt.rag_system_message()

    assert isinstance(message, Message)
    assert message.role == "system"
    assert message.text == core_rag_prompt.system_message().content
