from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 移植元 application.yml の spring.servlet.multipart に合わせた上限
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024
MAX_REQUEST_SIZE_BYTES = 215 * 1024 * 1024
# 設定値はミリ秒（移植元の *-ms）で受け取り、asyncio には秒で渡すための換算
MS_PER_SECOND = 1000


class DatabaseSettings(BaseSettings):
    """DB の接続先。マイグレーション（alembic）はこれだけを読む。

    Settings は認証キーなどが必須のため、マイグレーションでは DB の設定だけを読む。
    アプリと同じく環境変数と `.env` から読み、マイグレーション先とアプリの DB が
    ずれないようにする。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/nawdb.sqlite3", alias="DATABASE_URL"
    )


class Settings(DatabaseSettings):
    """移植元 application.yml の各設定を環境変数で受け取る。

    環境変数名は Spring のプロパティ名を大文字・アンダースコア区切りにしたもの
    （例: `security.server-auth-key` → `SECURITY_SERVER_AUTH_KEY`）。
    """

    # 移植元では既定値がなく未設定だと起動に失敗する。認証なしで公開される事故を
    # 防ぐため、こちらも必須にする。
    server_auth_key: str = Field(alias="SECURITY_SERVER_AUTH_KEY", min_length=1)

    waha_url: str = Field(default="http://localhost/", alias="WAHA_URL")
    waha_authkey: str = Field(default="", alias="WAHA_AUTHKEY")
    waha_result_retry_interval_ms: int = Field(
        default=2000, alias="WAHA_RESULT_RETRY_INTERVAL_MS", ge=0
    )
    waha_result_max_retries: int = Field(
        default=10, alias="WAHA_RESULT_MAX_RETRIES", ge=1
    )

    naw_base_url: str = Field(default="", alias="NAW_BASE_URL")

    context_path: str = Field(default="", alias="CONTEXT_PATH")

    stream_output_dir: str = Field(
        default="./data/stream-output", alias="STREAM_OUTPUT_DIR"
    )
    # Waha! が別コンテナ・ホストで動く場合、同じディレクトリが別のパスで
    # 見えるため、Waha! に渡すパスだけを置き換えられるようにする。
    stream_waha_output_dir: str | None = Field(
        default=None, alias="STREAM_WAHA_OUTPUT_DIR"
    )
    stream_tail_poll_interval_ms: int = Field(
        default=200, alias="STREAM_TAIL_POLL_INTERVAL_MS", gt=0
    )
    stream_result_poll_interval_ms: int = Field(
        default=2000, alias="STREAM_RESULT_POLL_INTERVAL_MS", gt=0
    )
    stream_emitter_timeout_ms: int = Field(
        default=600_000, alias="STREAM_EMITTER_TIMEOUT_MS", gt=0
    )
    stream_orphan_cleanup_max_age_hours: int = Field(
        default=24, alias="STREAM_ORPHAN_CLEANUP_MAX_AGE_HOURS", ge=0
    )

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @field_validator("context_path")
    @classmethod
    def normalize_context_path(cls, v: str) -> str:
        """`secuaigent/` のような指定も `/secuaigent` に揃える。"""
        stripped = v.strip().strip("/")
        return f"/{stripped}" if stripped else ""

    @field_validator("naw_base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        """移植元 NawApiClient と同じく末尾の `/` を取り除く。"""
        return v.strip().rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
