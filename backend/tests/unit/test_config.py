from app.core.config import Settings


def _build_settings(**env_overrides: str) -> Settings:
    """テスト用に必須項目を埋めた Settings を組み立てる。

    `_env_file=None` でリポジトリの `.env` 読み込みを無効化し、
    テストで指定した値のみで `Settings` を構築する。
    """
    base = {
        "database_url": "postgresql+asyncpg://root:root@localhost:5433/postgres",
        "secret_key": "test-secret",
    }
    return Settings(_env_file=None, **base, **env_overrides)  # type: ignore[arg-type]


class TestCorsAllowedOrigins:
    def test_parses_comma_separated_origins(self):
        """カンマ区切りの環境変数を複数要素のリストにパースできること"""
        settings = _build_settings(
            CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:4201"
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://localhost:4201",
        ]

    def test_returns_empty_list_when_unset(self):
        """環境変数が未設定の場合は空リストを返すこと"""
        settings = _build_settings()

        assert settings.cors_allowed_origins == []

    def test_trims_whitespace_around_each_origin(self):
        """各オリジンの前後空白を除去すること"""
        settings = _build_settings(
            CORS_ALLOWED_ORIGINS=" http://localhost:5173 , http://localhost:4201 "
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://localhost:4201",
        ]


class TestCorsAllowedOriginRegex:
    def test_returns_none_when_unset(self):
        """環境変数が未設定の場合はNoneを返すこと"""
        settings = _build_settings()

        assert settings.cors_allowed_origin_regex is None
