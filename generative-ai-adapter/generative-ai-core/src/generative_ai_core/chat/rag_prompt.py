"""RAG 回答・検証で使う固定プロンプト（移植元 RagAnswerContractPrompt と、
SecuAiGentTransport・SpringAiChatPromptMapper の検証プロンプト）。

文言は移植元と 1 文字も変えないこと（プロバイダの応答形式が変わるため）。
"""

from generative_ai_core.chat.models import CoreMessage

RAG_ANSWER_CONTRACT_TEXT = """You are an assistant that answers questions based ONLY on the provided articles delimited by triple quotes.
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

RAG_VALIDATION_INSTRUCTION = """You are a validator that checks if the provided answer is reasonable based on the given context.
Your task is to evaluate if the answer is derived from and supported by the provided context.

Your response MUST be a single, valid JSON object with the following structure:
{
    "answer": boolean,
    "reason": string
}

Key requirements:
1. The "answer" field MUST be a boolean value (true or false)
2. Return true ONLY if the answer is fully supported by the provided context
3. Return false if the answer is not supported, contains speculation, or goes beyond the given context
4. Do not include any text outside the JSON object
"""


def system_message() -> CoreMessage:
    """RAG 回答の契約を伝えるシステムメッセージを作る。

    Returns
    -------
    CoreMessage
        固定の契約文を持つ SYSTEM メッセージ。
    """
    return CoreMessage.system(RAG_ANSWER_CONTRACT_TEXT)


def context_text(path: str, content: str) -> str:
    """RAG のコンテキスト 1 件の文字列を作る。

    Parameters
    ----------
    path : str
        コンテキストのパス。
    content : str
        コンテキストの本文。

    Returns
    -------
    str
        プロンプトに入れる文字列。
    """
    return f"Context path: {path}\nContext:\n{content}"
