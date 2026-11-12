from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend の AZURE_OPENAI_API_VERSION の既定値と揃える
DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21"


class LlmProvider(StrEnum):
    ECHO = "echo"
    AZURE_OPENAI = "azure_openai"


class Settings(BaseSettings):
    """エミュレーターの設定。環境変数と `.env` から読む。"""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # server-local の WAHA_AUTHKEY と同じ値を設定する。認証なしで動く事故を防ぐため必須
    authkey: str = Field(alias="WAHA_AUTHKEY", min_length=1)
    # server-local の同期 API・学習は execute の後に回数制限付きで結果を待つため、
    # 既定はジョブの完了まで execute を返さない（docs/issue-274/02_基本設計.md）
    execute_wait_for_completion: bool = Field(
        default=True, alias="EXECUTE_WAIT_FOR_COMPLETION"
    )
    # 設定すると、streamfilepath をこのディレクトリの中だけに制限する
    stream_allowed_dir: Path | None = Field(default=None, alias="STREAM_ALLOWED_DIR")

    llm_provider: LlmProvider = Field(default=LlmProvider.ECHO, alias="LLM_PROVIDER")
    azure_openai_endpoint: str = Field(default="", alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_api_key: str = Field(default="", alias="AZURE_OPENAI_API_KEY")
    azure_openai_deployment: str = Field(default="", alias="AZURE_OPENAI_DEPLOYMENT")
    azure_openai_api_version: str = Field(
        default=DEFAULT_AZURE_OPENAI_API_VERSION, alias="AZURE_OPENAI_API_VERSION"
    )

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @model_validator(mode="after")
    def require_azure_openai_settings(self) -> Self:
        """Azure OpenAI を選んだのに接続先が足りなければ、起動時に失敗させる。

        起動後の最初のチャットで初めて失敗すると、原因に気づきにくいため。
        """
        if self.llm_provider != LlmProvider.AZURE_OPENAI:
            return self
        missing = [
            name
            for name, value in (
                ("AZURE_OPENAI_ENDPOINT", self.azure_openai_endpoint),
                ("AZURE_OPENAI_API_KEY", self.azure_openai_api_key),
                ("AZURE_OPENAI_DEPLOYMENT", self.azure_openai_deployment),
            )
            if not value.strip()
        ]
        if missing:
            raise ValueError(
                f"LLM_PROVIDER=azure_openai では {', '.join(missing)} が必要です"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    # 必須値（WAHA_AUTHKEY）は環境変数・.env から読む
    return Settings()
