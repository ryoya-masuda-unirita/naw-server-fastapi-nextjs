from app.core.config import AzureOpenAISettings, CorsSettings, Settings


def _build_cors_settings(**env_overrides: str) -> CorsSettings:
    """テスト用に `.env` を読み込まずに `CorsSettings` を組み立てる。

    Args:
        **env_overrides: `CorsSettings` のエイリアス名（例: `CORS_ALLOWED_ORIGINS`）
            をキーとした環境変数の上書き値。

    Returns:
        `.env` に依存しない `CorsSettings` インスタンス。
    """
    return CorsSettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


def _build_settings(**env_overrides: str) -> Settings:
    """テスト用に `.env` を読み込まずに `Settings` を組み立てる。

    Args:
        **env_overrides: `Settings` のエイリアス名をキーとした環境変数の上書き値。

    Returns:
        `.env` に依存しない `Settings` インスタンス。
    """
    base = {"database_url": "postgresql+asyncpg://test", "secret_key": "test-secret"}
    base.update(env_overrides)
    return Settings(_env_file=None, **base)  # type: ignore[arg-type]


def _build_azure_openai_settings(**env_overrides: str) -> AzureOpenAISettings:
    """テスト用に `.env` を読み込まずに `AzureOpenAISettings` を組み立てる。"""
    return AzureOpenAISettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


class TestCorsAllowedOrigins:
    def test_parses_comma_separated_origins(self):
        """カンマ区切りの環境変数を複数要素のリストにパースできること"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:4201"
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://localhost:4201",
        ]

    def test_returns_empty_list_when_unset(self):
        """環境変数が未設定の場合は空リストを返すこと"""
        settings = _build_cors_settings()

        assert settings.cors_allowed_origins == []

    def test_trims_whitespace_around_each_origin(self):
        """各オリジンの前後空白を除去すること"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGINS=" http://localhost:5173 , http://localhost:4201 "
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://localhost:4201",
        ]


class TestCorsAllowedOriginRegex:
    def test_returns_none_when_unset(self):
        """環境変数が未設定の場合はNoneを返すこと"""
        settings = _build_cors_settings()

        assert settings.cors_allowed_origin_regex is None

    def test_returns_none_when_empty_string(self):
        """環境変数が空文字列の場合もNoneに正規化されること"""
        settings = _build_cors_settings(CORS_ALLOWED_ORIGIN_REGEX="")

        assert settings.cors_allowed_origin_regex is None

    def test_returns_value_when_set(self):
        """環境変数が設定されている場合はその値を返すこと"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGIN_REGEX=r"https://.*\.example\.com$"
        )

        assert settings.cors_allowed_origin_regex == r"https://.*\.example\.com$"


class TestCookieSecure:
    def test_defaults_to_false_when_unset(self):
        """COOKIE_SECURE未設定時はFalseになること"""
        settings = _build_settings()

        assert settings.cookie_secure is False

    def test_reflects_true_when_set(self):
        """COOKIE_SECURE=trueの場合Trueになること"""
        settings = _build_settings(COOKIE_SECURE="true")

        assert settings.cookie_secure is True


class TestAzureOpenAISettings:
    def test_defaults_to_current_api_versions(self):
        """Azure OpenAI APIバージョン未設定時は現行デフォルト値になること"""
        settings = _build_azure_openai_settings()

        assert settings.api_version == "2024-10-21"
        assert settings.responses_api_version == "2025-04-01-preview"

    def test_reflects_env_overrides(self):
        """Azure OpenAI APIバージョンを環境変数相当の値で上書きできること"""
        settings = _build_azure_openai_settings(
            AZURE_OPENAI_API_VERSION="2026-01-01",
            AZURE_OPENAI_RESPONSES_API_VERSION="2026-02-01-preview",
        )

        assert settings.api_version == "2026-01-01"
        assert settings.responses_api_version == "2026-02-01-preview"


class TestSettingsImportIndependence:
    def test_app_main_importable_without_env_file(self, tmp_path):
        """DB接続情報（.env）が無い環境でも app.main のインポートが失敗しないこと

        main.py は CORS 設定にのみ CorsSettings を使う。CorsSettings は
        database_url・secret_key を要求しないため、.env が存在しない環境でも
        app.main のインポート自体は成功しなければならない
        （回帰防止: 以前は main.py が Settings 全体を読み込んでいたため、
        .env が無いと import 自体が ValidationError で失敗していた）。

        同一プロセス内での再importはSQLModelの共有メタデータを壊すため、
        サブプロセスで検証する。
        """
        import subprocess
        import sys
        from pathlib import Path

        backend_dir = Path(__file__).parent.parent.parent
        result = subprocess.run(
            [sys.executable, "-c", "import app.main"],
            cwd=tmp_path,
            env={"PATH": "/usr/bin:/bin", "PYTHONPATH": str(backend_dir)},
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, result.stderr
