from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    secret_key: str
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    cookie_same_site: Literal["lax", "strict", "none"] = Field(
        default="lax", alias="COOKIE_SAME_SITE"
    )
    file_storage_root: str = Field(default="./data/files", alias="FILE_STORAGE_ROOT")

    @model_validator(mode="after")
    def _validate_cookie_same_site_requires_secure(self) -> "Settings":
        """`SameSite=None`は`Secure`が伴わないとブラウザに拒否されるため整合性を検証する。

        Raises:
            ValueError: `cookie_same_site`が`none`なのに`cookie_secure`が`False`の場合。
        """
        if self.cookie_same_site == "none" and not self.cookie_secure:
            raise ValueError(
                "COOKIE_SAME_SITE=none には COOKIE_SECURE=true が必須です"
                "（SameSite=NoneのみだとブラウザがCookieを拒否します）"
            )
        return self


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


class AzureCostSettings(BaseSettings):
    """Azure Cost Management API連携用の設定。

    `Settings` とは別クラスにする。理由は`CorsSettings`と同様（このAPIを使わない
    環境・単体テストで`app.main`をインポートするだけで必須値エラーになるのを防ぐため）。
    移植元Java版の`azure.app.*`（`@Value`注入）に対応する。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    azure_subscription_id: str = Field(alias="AZURE_APP_SUBSCRIPTION_ID")
    azure_resource_group_name: str = Field(alias="AZURE_APP_RESOURCE_GROUP_NAME")
    azure_tenant_id: str = Field(alias="AZURE_APP_TENANT_ID")
    azure_client_id: str = Field(alias="AZURE_APP_CLIENT_ID")
    azure_client_secret_value: str = Field(alias="AZURE_APP_CLIENT_SECRET_VALUE")


class LlmCreditSettings(BaseSettings):
    """LLMトークン消費量をクレジットへ換算するための設定。

    `Settings` とは別クラスにする。理由は`CorsSettings`と同様（このAPIを使わない
    環境・単体テストで`app.main`をインポートするだけで必須値エラーになるのを防ぐため）。
    移植元Java版の`naw.token-usage.credit.*`（`@Value`注入）に対応する。デフォルト値は
    移植元の`application-*.yaml`に記載の値をそのまま踏襲する。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    tokens_per_credit: int = Field(default=1000, alias="TOKENS_PER_CREDIT")
    input_credit_weight: float = Field(default=1 / 3, alias="INPUT_CREDIT_WEIGHT")


class RedisSettings(BaseSettings):
    """Redis接続設定。

    `Settings` とは別クラスにする。理由は`CorsSettings`と同様（Redisを使わない
    単体テスト等で`app.main`をインポートするだけで必須値エラーになるのを防ぐため）。
    移植元Java版の`spring.data.redis.host`/`port`（環境変数`REDIS_HOST`/`REDIS_PORT`）に
    対応するが、`redis-py`の慣例に合わせて接続文字列1本（`REDIS_URL`）にまとめる。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    redis_url: str = Field(default="redis://localhost:6380/0", alias="REDIS_URL")


class AwsSettings(BaseSettings):
    """S3/SQS接続設定。

    `Settings` とは別クラスにする。理由は`CorsSettings`と同様（S3/SQSを使わない
    単体テスト等で`app.main`をインポートするだけで必須値エラーになるのを防ぐため）。
    移植元Java版の`aws.*`（`@Value`注入）に対応する。`aws_endpoint_url`はローカル環境で
    LocalStackに向けるためのもので、実AWS環境では未設定（本来のAWSエンドポイントを使用）にする。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    aws_region: str = Field(default="ap-northeast-1", alias="AWS_REGION")
    aws_endpoint_url: str | None = Field(default=None, alias="AWS_ENDPOINT_URL")
    aws_access_key_id: str | None = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str | None = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )
    # 未設定でも`AwsSettings()`自体の生成（＝app起動）は失敗させない。
    # `app.main`の`lifespan`はSQS/S3を使わない設定（`aws_sqs_listener_enabled=false`）
    # でも無条件に`AwsSettings()`を生成するため、ここを必須フィールドにすると
    # S3/SQSを使わない環境でもapp起動自体が落ちてしまう。空文字のまま実際に
    # 使用しようとした場合は、呼び出し先（キュー送受信・S3アップロード）側で
    # 明示的にエラーにする。
    aws_s3_bucket_name: str = Field(default="", alias="AWS_S3_BUCKET_NAME")
    aws_sqs_queue_url: str = Field(default="", alias="AWS_SQS_QUEUE_URL")
    aws_sqs_listener_enabled: bool = Field(
        default=True, alias="AWS_SQS_LISTENER_ENABLED"
    )


class AzureOpenAISettings(BaseSettings):
    """Azure OpenAI API呼び出し用のアプリ共通設定。

    テナントごとのendpoint・api_key・deploymentはDBで管理するため、この設定では
    SDKクライアント生成時に共通で使うAPIバージョンだけを扱う。
    """

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    api_version: str = Field(default="2024-10-21", alias="AZURE_OPENAI_API_VERSION")
    responses_api_version: str = Field(
        default="2025-04-01-preview", alias="AZURE_OPENAI_RESPONSES_API_VERSION"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_cors_settings() -> CorsSettings:
    return CorsSettings()


@lru_cache
def get_azure_cost_settings() -> AzureCostSettings:
    return AzureCostSettings()


@lru_cache
def get_llm_credit_settings() -> LlmCreditSettings:
    return LlmCreditSettings()


@lru_cache
def get_azure_openai_settings() -> AzureOpenAISettings:
    return AzureOpenAISettings()


@lru_cache
def get_redis_settings() -> RedisSettings:
    return RedisSettings()


@lru_cache
def get_aws_settings() -> AwsSettings:
    return AwsSettings()
