from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class SystemPromptTemplate(SQLModel, table=True):
    """アプリケーション共通の固定システムプロンプト(テナントに依存しないマスタデータ)。

    移植元(Spring Boot)の`SystemPromptTemplateEntity`に対応する。`type`をキーに、
    ライブラリ生成(`createLibrary`)等、機能ごとに固定のシステムプロンプト本文を持つ。
    """

    __tablename__ = "system_prompt_templates"

    type: str = Field(max_length=64, primary_key=True)
    content: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
