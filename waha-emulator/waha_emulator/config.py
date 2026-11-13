import logging
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# server-local の SSE のタイムアウト（既定 10 分）より十分長くする
DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS = 3600.0


class LlmProvider(StrEnum):
    """`WAHA_WORKFLOWS_FILE` がないときの既定のワークフローのプロバイダ。"""

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
    # server-local が endsession を呼ばずに終わったセッションを破棄するまでの時間
    session_idle_timeout_seconds: float = Field(
        default=DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS,
        alias="SESSION_IDLE_TIMEOUT_SECONDS",
        gt=0,
    )

    @field_validator("workflows_file", mode="before")
    @classmethod
    def blank_workflows_file_is_unset(cls, v: object) -> object:
        """空文字列（compose が未設定を空で渡す）は未設定として扱う。

        Parameters
        ----------
        v : object
            WAHA_WORKFLOWS_FILE の値。

        Returns
        -------
        object
            空文字列なら None、それ以外は受け取った値。
        """
        return None if isinstance(v, str) and not v.strip() else v

    llm_provider: LlmProvider = Field(default=LlmProvider.ECHO, alias="LLM_PROVIDER")
    azure_openai_endpoint: str = Field(default="", alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_api_key: str = Field(default="", alias="AZURE_OPENAI_API_KEY")
    azure_openai_deployment: str = Field(default="", alias="AZURE_OPENAI_DEPLOYMENT")
    # サービス ID → ワークフロー（生成AIアダプタの設定）の JSON。なければ LLM_PROVIDER
    # から既定のワークフローを作る（waha_emulator/workflow_config.py）
    workflows_file: Path | None = Field(default=None, alias="WAHA_WORKFLOWS_FILE")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """logging にないレベル名は、起動時に分かりやすいメッセージで失敗させる。

        Parameters
        ----------
        v : str
            LOG_LEVEL の値。

        Returns
        -------
        str
            大文字にしたレベル名。

        Raises
        ------
        ValueError
            logging にないレベル名のとき。
        """
        level = v.strip().upper()
        if level not in logging.getLevelNamesMapping():
            raise ValueError(f"LOG_LEVEL が不正です: {v}")
        return level

    @model_validator(mode="after")
    def require_azure_openai_settings(self) -> Self:
        """Azure OpenAI を選んだのに接続先が足りなければ、起動時に失敗させる。

        起動後の最初のチャットで初めて失敗すると、原因に気づきにくいため。

        Returns
        -------
        Self
            検証した設定。

        Raises
        ------
        ValueError
            接続先が足りないとき。
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
    """環境変数・.env から設定を読む（必須値は WAHA_AUTHKEY）。

    Returns
    -------
    Settings
        設定。
    """
    return Settings()
