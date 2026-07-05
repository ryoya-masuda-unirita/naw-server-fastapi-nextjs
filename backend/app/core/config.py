from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: str
    cors_allowed_origins_raw: str = Field(default="", alias="CORS_ALLOWED_ORIGINS")
    cors_allowed_origin_regex: str | None = Field(
        default=None, alias="CORS_ALLOWED_ORIGIN_REGEX"
    )

    @property
    def cors_allowed_origins(self) -> list[str]:
        """CORS許可オリジンのリストを返す。

        pydantic-settings は list[str] 型のフィールドを環境変数から読む際に
        JSON 形式を要求するため、カンマ区切りの `.env` 値をそのまま扱えるよう
        raw な str フィールドを介してパースする。

        Returns:
            カンマ区切りをパースした許可オリジンのリスト。
        """
        return [
            origin.strip()
            for origin in self.cors_allowed_origins_raw.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
