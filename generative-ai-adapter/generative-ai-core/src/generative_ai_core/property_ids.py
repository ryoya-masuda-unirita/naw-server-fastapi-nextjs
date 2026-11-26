"""プロパティ ID の表（各アダプタの `PropertyIds`）の共通の基底クラス。"""


class PropertyIdsBase:
    """プロパティ ID の定数（大文字の整数）を持つクラスの基底。"""

    @classmethod
    def by_name(cls) -> dict[str, int]:
        """名前から ID への対応を返す（エミュレーターの設定ファイルで名前を使うため）。

        Returns
        -------
        dict[str, int]
            定数名をキー、ID を値とする辞書。
        """
        return {
            name: value
            for name, value in vars(cls).items()
            if name.isupper() and isinstance(value, int)
        }


# プロパティ 30（エンベディングのプロバイダー）の ID → ベンダー名。埋め込み・検索のアダプタで共通。
# 移植元の表のまま（生成AIアダプタとは番号が違う）。
# 97（Bedrock）・99（Echo。キーなしの確認用）は Python 版だけの拡張
EMBEDDING_VENDOR_NAMES = {
    "0": "OpenAI",
    "1": "AzureOpenAI",
    "2": "VertexAI Gemini",
    "3": "Anthropic",
    "5": "SecuAiGent",
    "97": "Bedrock",  # bedrock-ext
    "99": "Echo",
}

# プロパティ 31（ベクトルDB のプロバイダー）の ID → 名前。埋め込み・検索のアダプタで共通
VDB_VENDOR_NAMES = {
    "0": "Azure AI Search",
    "1": "PostgreSQL(PGVector)",
}
