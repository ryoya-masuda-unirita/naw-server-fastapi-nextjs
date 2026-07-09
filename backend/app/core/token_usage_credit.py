"""LLMトークン消費量をクレジット数へ換算する純粋関数群。

移植元(Spring Boot)の`TokenUsage.inputCredits`/`outputCredits`/`embeddingCredits`に対応する。
複数のservice（`llm_chat_service.py`・`llm_embedding_service.py`）から共通で使う計算ロジックのため、
「serviceが別serviceを呼ばない」規約に抵触しないよう`core/`（純粋な計算ユーティリティ）に置く。
"""

import math


def input_credits(
    input_tokens: int,
    tokens_per_credit: int,
    input_credit_weight: float,
    token_weight: float,
) -> int:
    """入力トークン数からクレジット数を算出する（切り上げ）。

    Args:
        input_tokens: 入力トークン数。
        tokens_per_credit: 1クレジットあたりのトークン数。
        input_credit_weight: 入力トークンの重み係数。
        token_weight: 呼び出したモデル(`ai_models.token_weight`)の重み係数。

    Returns:
        入力トークン数から算出したクレジット数。`input_tokens`が0以下の場合は0。
    """
    if input_tokens <= 0:
        return 0
    credits = (input_tokens * input_credit_weight * token_weight) / tokens_per_credit
    return math.ceil(credits)


def output_credits(
    output_tokens: int, tokens_per_credit: int, token_weight: float
) -> int:
    """出力トークン数からクレジット数を算出する（切り上げ）。

    Args:
        output_tokens: 出力トークン数。
        tokens_per_credit: 1クレジットあたりのトークン数。
        token_weight: 呼び出したモデル(`ai_models.token_weight`)の重み係数。

    Returns:
        出力トークン数から算出したクレジット数。`output_tokens`が0以下の場合は0。
    """
    if output_tokens <= 0:
        return 0
    return math.ceil((output_tokens * token_weight) / tokens_per_credit)


def embedding_credits(
    embedding_tokens: int, tokens_per_credit: int, token_weight: float
) -> int:
    """埋め込みトークン数からクレジット数を算出する（切り上げ）。

    Args:
        embedding_tokens: 埋め込みトークン数。
        tokens_per_credit: 1クレジットあたりのトークン数。
        token_weight: 呼び出した埋め込みモデル(`ai_models.token_weight`)の重み係数。

    Returns:
        埋め込みトークン数から算出したクレジット数。`embedding_tokens`が0以下の場合は0。
    """
    if embedding_tokens <= 0:
        return 0
    return math.ceil((embedding_tokens * token_weight) / tokens_per_credit)
