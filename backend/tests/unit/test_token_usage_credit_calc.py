import math

from app.core.token_usage_credit import embedding_credits, input_credits, output_credits


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
