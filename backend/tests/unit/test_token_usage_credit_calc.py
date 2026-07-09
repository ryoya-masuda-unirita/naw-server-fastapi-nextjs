import math

from app.core.token_usage_credit import (
    embedding_credits,
    input_credits,
    output_credits,
    positive_token_weight,
)


class TestPositiveTokenWeight:
    """positive_token_weight のテスト"""

    def test_returns_as_is_when_positive(self):
        """正の値はそのまま返すこと"""
        assert positive_token_weight(2.5) == 2.5

    def test_falls_back_to_one_when_not_positive(self):
        """0以下の場合1.0にフォールバックすること"""
        assert positive_token_weight(0.0) == 1.0
        assert positive_token_weight(-1.0) == 1.0

    def test_falls_back_to_one_when_nan_or_infinite(self):
        """NaN・無限大の場合1.0にフォールバックすること"""
        assert positive_token_weight(float("nan")) == 1.0
        assert positive_token_weight(float("inf")) == 1.0


class TestInputCredits:
    """input_credits のテスト"""

    def test_returns_zero_when_tokens_not_positive(self):
        """入力トークン数が0以下の場合0を返すこと"""
        assert input_credits(0, 1000, 1 / 3, 1.0) == 0
        assert input_credits(-1, 1000, 1 / 3, 1.0) == 0

    def test_calculates_ceiling_credits(self):
        """移植元と同じ計算式（切り上げ）でクレジットを算出すること"""
        # (1000 * (1/3) * 1.0) / 1000 = 0.333... -> 切り上げで1
        assert input_credits(1000, 1000, 1 / 3, 1.0) == 1

    def test_applies_token_weight(self):
        """モデルのtoken_weightが計算に反映されること"""
        # (1000 * (1/3) * 3.0) / 1000 = 1.0 -> ちょうど1
        assert input_credits(1000, 1000, 1 / 3, 3.0) == 1
        # (1000 * (1/3) * 6.0) / 1000 = 2.0 -> ちょうど2
        assert input_credits(1000, 1000, 1 / 3, 6.0) == 2


class TestOutputCredits:
    """output_credits のテスト"""

    def test_returns_zero_when_tokens_not_positive(self):
        """出力トークン数が0以下の場合0を返すこと"""
        assert output_credits(0, 1000, 1.0) == 0

    def test_calculates_ceiling_credits(self):
        """移植元と同じ計算式（切り上げ）でクレジットを算出すること"""
        assert output_credits(1500, 1000, 1.0) == math.ceil(1500 / 1000)
        assert output_credits(1000, 1000, 1.0) == 1


class TestEmbeddingCredits:
    """embedding_credits のテスト"""

    def test_returns_zero_when_tokens_not_positive(self):
        """埋め込みトークン数が0以下の場合0を返すこと"""
        assert embedding_credits(0, 1000, 1.0) == 0

    def test_calculates_ceiling_credits(self):
        """移植元と同じ計算式（切り上げ）でクレジットを算出すること"""
        assert embedding_credits(2001, 1000, 1.0) == 3
