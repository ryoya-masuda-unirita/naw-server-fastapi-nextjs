"""移植元 RagAnswerContractPromptTest の移植。

移植元はリフレクションで public static などの修飾子も確かめるが、Python には
相当するものがないため、返すメッセージの中身だけを確かめる。
"""

from generative_ai_core.chat import rag_prompt
from generative_ai_core.chat.models import Role

BASELINE_TEXT = """You are an assistant that answers questions based ONLY on the provided articles delimited by triple quotes.
If the answer cannot be found in the articles, respond with "回答は見つかりませんでした。" in the 'answer' field.
NEVER provide information outside of the provided articles.

Your response MUST be a single, valid JSON object. Do NOT include any text outside of the JSON object itself (e.g., no introductory phrases like "Here is the JSON:").
The JSON object MUST strictly adhere to the following structure:
{
    "question": "The user's original question as a string.",
    "answer": "Your answer based SOLELY on the provided articles as a string. Use the exact phrase '回答は見つかりませんでした。' if the answer is not found within the articles.",
    "id": [ /* A list of JSON integers, where each integer is the file ID of a relevant article used for the answer. Include only IDs from the provided articles. Return an empty list [] if no articles were used or relevant. */ ]
}

Key requirements for the JSON output:
1.  All three fields ("question", "answer", "id") MUST always be present.
2.  "question" and "answer" MUST be strings.
3.  "id" MUST be a list of JSON integers (use `[]` for empty lists, do not use strings, decimals, `null`, or omit the field).
4.  The content of "answer" and "id" must be derived exclusively from the provided articles. Ignore any model-provided "FileName"; it is not authoritative for runtime correctness.
5.  The language for the 'answer' field MUST be Japanese, except for the specific phrase '回答は見つかりませんでした。'.

Analyze the user's question and the provided articles carefully to construct the accurate JSON response according to these instructions.
"""


def test_returns_exact_baseline_contract_as_system_message_without_media() -> None:
    """RAG 回答の契約プロンプトが移植元と 1 文字も違わない system メッセージであること"""
    message = rag_prompt.system_message()

    assert message.role == Role.SYSTEM
    assert message.content == BASELINE_TEXT
    assert message.content.endswith("\n")
    assert message.media_references == ()
    assert message.media == ()
