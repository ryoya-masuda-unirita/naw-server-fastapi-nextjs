import pytest
from pydantic import ValidationError

from app.core.config import (
    AwsSettings,
    AzureOpenAISettings,
    CorsSettings,
    PasswordResetSettings,
    Settings,
)
from pathlib import Path


def _build_cors_settings(**env_overrides: str) -> CorsSettings:
    """テスト用に `.env` を読み込まずに `CorsSettings` を組み立てる。

    Parameters
    ----------
    **env_overrides : str
        `CorsSettings` のエイリアス名（例: `CORS_ALLOWED_ORIGINS`）
        をキーとした環境変数の上書き値。

    Returns
    -------
    CorsSettings
        `.env` に依存しない `CorsSettings` インスタンス。
    """
    return CorsSettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


def _build_settings(**env_overrides: str) -> Settings:
    """テスト用に `.env` を読み込まずに `Settings` を組み立てる。

    Parameters
    ----------
    **env_overrides : str
        `Settings` のエイリアス名をキーとした環境変数の上書き値。

    Returns
    -------
    Settings
        `.env` に依存しない `Settings` インスタンス。
    """
    base = {"database_url": "postgresql+asyncpg://test", "secret_key": "test-secret"}
    base.update(env_overrides)
    return Settings(_env_file=None, **base)  # type: ignore[arg-type]


def _build_azure_openai_settings(**env_overrides: str) -> AzureOpenAISettings:
    """テスト用に `.env` を読み込まずに `AzureOpenAISettings` を組み立てる。"""
    return AzureOpenAISettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


def _build_aws_settings(**env_overrides: str) -> AwsSettings:
    """テスト用に `.env` を読み込まずに `AwsSettings` を組み立てる。"""
    return AwsSettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


class TestCorsAllowedOrigins:
    """CORS許可オリジン設定のテスト。"""

    def test_parses_comma_separated_origins(self) -> None:
        """カンマ区切りの環境変数を複数要素のリストにパースできること"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]

    def test_returns_empty_list_when_unset(self) -> None:
        """環境変数が未設定の場合は空リストを返すこと"""
        settings = _build_cors_settings()

        assert settings.cors_allowed_origins == []

    def test_trims_whitespace_around_each_origin(self) -> None:
        """各オリジンの前後空白を除去すること"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGINS=" http://localhost:5173 , http://127.0.0.1:5173 "
        )

        assert settings.cors_allowed_origins == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]


class TestCorsAllowedOriginRegex:
    """CORS許可オリジン正規表現設定のテスト。"""

    def test_returns_none_when_unset(self) -> None:
        """環境変数が未設定の場合はNoneを返すこと"""
        settings = _build_cors_settings()

        assert settings.cors_allowed_origin_regex is None

    def test_returns_none_when_empty_string(self) -> None:
        """環境変数が空文字列の場合もNoneに正規化されること"""
        settings = _build_cors_settings(CORS_ALLOWED_ORIGIN_REGEX="")

        assert settings.cors_allowed_origin_regex is None

    def test_returns_value_when_set(self) -> None:
        """環境変数が設定されている場合はその値を返すこと"""
        settings = _build_cors_settings(
            CORS_ALLOWED_ORIGIN_REGEX=r"https://.*\.example\.com$"
        )

        assert settings.cors_allowed_origin_regex == r"https://.*\.example\.com$"


class TestCookieSecure:
    """Cookie の Secure 属性設定のテスト。"""

    def test_defaults_to_false_when_unset(self) -> None:
        """COOKIE_SECURE未設定時はFalseになること"""
        settings = _build_settings()

        assert settings.cookie_secure is False

    def test_reflects_true_when_set(self) -> None:
        """COOKIE_SECURE=trueの場合Trueになること"""
        settings = _build_settings(COOKIE_SECURE="true")

        assert settings.cookie_secure is True


class TestCookieSameSite:
    """Cookie の SameSite 属性設定のテスト。"""

    def test_defaults_to_lax_when_unset(self) -> None:
        """COOKIE_SAME_SITE未設定時はlaxになること"""
        settings = _build_settings()

        assert settings.cookie_same_site == "lax"

    def test_reflects_value_when_set(self) -> None:
        """COOKIE_SAME_SITEを設定した値が反映されること"""
        settings = _build_settings(COOKIE_SAME_SITE="strict")

        assert settings.cookie_same_site == "strict"

    def test_none_with_secure_true_is_allowed(self) -> None:
        """COOKIE_SAME_SITE=noneかつCOOKIE_SECURE=trueの組み合わせは許可されること"""
        settings = _build_settings(COOKIE_SAME_SITE="none", COOKIE_SECURE="true")

        assert settings.cookie_same_site == "none"
        assert settings.cookie_secure is True

    def test_none_with_secure_false_raises_error(self) -> None:
        """COOKIE_SAME_SITE=noneかつCOOKIE_SECURE=falseの組み合わせはエラーになること

        SameSite=NoneはSecure属性が伴わないとブラウザにCookieを拒否されるため、
        この組み合わせを設定時点で検出する。
        """
        with pytest.raises(ValueError, match="COOKIE_SECURE=true"):
            _build_settings(COOKIE_SAME_SITE="none", COOKIE_SECURE="false")


def _build_password_reset_settings(**env_overrides: str) -> PasswordResetSettings:
    """テスト用に `.env` を読み込まずに `PasswordResetSettings` を組み立てる。"""
    return PasswordResetSettings(_env_file=None, **env_overrides)  # type: ignore[arg-type]


class TestPasswordResetSettings:
    """パスワードリセット設定のテスト。"""

    def test_defaults_to_reference_values(self) -> None:
        """未設定時は移植元 application.yml と同じ 5 回・15 分になること"""
        settings = _build_password_reset_settings()

        assert settings.max_failure_attempts == 5
        assert settings.lockout_minutes == 15

    def test_reflects_env_overrides(self) -> None:
        """回数・ロック時間を環境変数相当の値で上書きできること"""
        settings = _build_password_reset_settings(
            PASSWORD_RESET_MAX_FAILURE_ATTEMPTS="3",
            PASSWORD_RESET_LOCKOUT_MINUTES="30",
        )

        assert settings.max_failure_attempts == 3
        assert settings.lockout_minutes == 30

    @pytest.mark.parametrize(
        "env_name",
        ["PASSWORD_RESET_MAX_FAILURE_ATTEMPTS", "PASSWORD_RESET_LOCKOUT_MINUTES"],
    )
    @pytest.mark.parametrize("value", ["0", "-1"])
    def test_rejects_non_positive_values(self, env_name: str, value: str) -> None:
        """回数・ロック時間が 0 以下ならロックが正しく働かないため起動時にエラーになること"""
        with pytest.raises(ValidationError):
            _build_password_reset_settings(**{env_name: value})


class TestAzureOpenAISettings:
    """Azure OpenAI 設定のテスト。"""

    def test_defaults_to_current_api_versions(self) -> None:
        """Azure OpenAI APIバージョン未設定時は現行デフォルト値になること"""
        settings = _build_azure_openai_settings()

        assert settings.api_version == "2024-10-21"
        assert settings.responses_api_version == "2025-04-01-preview"

    def test_reflects_env_overrides(self) -> None:
        """Azure OpenAI APIバージョンを環境変数相当の値で上書きできること"""
        settings = _build_azure_openai_settings(
            AZURE_OPENAI_API_VERSION="2026-01-01",
            AZURE_OPENAI_RESPONSES_API_VERSION="2026-02-01-preview",
        )

        assert settings.api_version == "2026-01-01"
        assert settings.responses_api_version == "2026-02-01-preview"


class TestAwsSettings:
    """AWS 設定のテスト。"""

    def test_constructs_without_env_when_s3_and_sqs_unset(self) -> None:
        """AWS_S3_BUCKET_NAME/AWS_SQS_QUEUE_URLが未設定でも生成自体は失敗しないこと

        回帰防止: これらを必須フィールドにすると、S3/SQSを使わない環境
        （AWS_SQS_LISTENER_ENABLED=false等）でもapp起動時にAwsSettings()の
        生成自体がValidationErrorで失敗してしまう。
        """
        settings = _build_aws_settings()

        assert settings.aws_s3_bucket_name == ""
        assert settings.aws_sqs_queue_url == ""
        assert settings.aws_region == "ap-northeast-1"
        assert settings.aws_sqs_listener_enabled is True

    def test_reflects_env_overrides(self) -> None:
        """環境変数を設定した場合その値が反映されること"""
        settings = _build_aws_settings(
            AWS_S3_BUCKET_NAME="test-bucket",
            AWS_SQS_QUEUE_URL="http://localstack:4566/000000000000/test-queue",
            AWS_SQS_LISTENER_ENABLED="false",
        )

        assert settings.aws_s3_bucket_name == "test-bucket"
        assert (
            settings.aws_sqs_queue_url
            == "http://localstack:4566/000000000000/test-queue"
        )
        assert settings.aws_sqs_listener_enabled is False


class TestSettingsImportIndependence:
    """設定クラスのインポートが `.env` に依存しないことのテスト。"""

    def test_app_main_importable_without_env_file(self, tmp_path: Path) -> None:
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
