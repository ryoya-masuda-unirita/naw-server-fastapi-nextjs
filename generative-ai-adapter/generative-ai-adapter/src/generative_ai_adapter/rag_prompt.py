"""RAG 回答の契約プロンプトの adapter 側の入口（移植元 service/RagAnswerContractPrompt）。"""

from generative_ai_core.chat import rag_prompt

from generative_ai_adapter.domain import Message

SYSTEM_ROLE_INDEX = 1


def rag_system_message() -> Message:
    """core の RAG 回答の契約プロンプトを system のメッセージにする。

    Returns
    -------
    Message
        system のメッセージ。
    """
    return Message.of_index(SYSTEM_ROLE_INDEX, rag_prompt.system_message().content)
