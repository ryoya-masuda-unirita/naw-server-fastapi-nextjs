from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    secret_key: str
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")


class CorsSettings(BaseSettings):
    """CORS関連の設定。

    `Settings` とは別クラスにする。`app.main` はモジュール読み込み時に
    CORSMiddleware を組み込む必要があるが、`database_url`・`secret_key` が
    必須の `Settings` と同じクラスにすると、DB接続情報を持たない環境
    （新規clone・CIでの単体テスト等）で `app.main` をインポートするだけで
    失敗してしまうため。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list, alias="CORS_ALLOWED_ORIGINS"
    )
    cors_allowed_origin_regex: str | None = Field(
        default=None, alias="CORS_ALLOWED_ORIGIN_REGEX"
    )

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_csv(cls, v: str | list[str]) -> list[str]:
        """カンマ区切りの環境変数を許可オリジンのリストに変換する。

        Args:
            v: 環境変数から読み込んだ生の値（カンマ区切り文字列、または既にリストの場合はそのまま）。

        Returns:
            前後の空白を除去した許可オリジンのリスト。
        """
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("cors_allowed_origin_regex", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: str | None) -> str | None:
        """空文字列をNoneに正規化する。

        `.env` に `CORS_ALLOWED_ORIGIN_REGEX=`（値なし）と書かれている場合、
        pydantic-settings は `None` ではなく空文字列 `''` として読み込むため、
        ここで正規化しないと `CORSMiddleware` に無意味な空パターンが渡ってしまう。

        Args:
            v: 環境変数から読み込んだ生の値。

        Returns:
            空文字列であれば `None`、それ以外はそのままの値。
        """
        return v or None


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_cors_settings() -> CorsSettings:
    return CorsSettings()
