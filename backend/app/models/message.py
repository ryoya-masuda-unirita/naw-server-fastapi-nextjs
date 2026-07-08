import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class MessageContentStatus(str, Enum):
    OK = "OK"
    ERROR = "ERROR"


class MessageRating(str, Enum):
    GOOD = "GOOD"
    BAD = "BAD"


class Message(SQLModel, table=True):
    """チャットの質問スレッド本体。回答本文は`MessageContent`に持つ。"""

    __tablename__ = "messages"
    __table_args__ = (
        sa.UniqueConstraint("id", "tenant_id", name="uq_messages_id_tenant_id"),
        sa.ForeignKeyConstraint(
            ["room_id", "tenant_id"],
            ["rooms.id", "rooms.tenant_id"],
            ondelete="CASCADE",
            name="fk_messages_room_id",
        ),
    )

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    room_id: str = Field(max_length=32)
    # アシスタント削除時に SET NULL されるため nullable。
    assistant_id: str | None = Field(
        default=None,
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("assistants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    parent_id: str | None = Field(
        default=None,
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    # チャット送信時に指定された tools（web_search / mcp 等）。ToolConfig のリストを JSON 文字列で保持する。
    tools: str | None = Field(default=None, sa_column=sa.Column(sa.Text, nullable=True))
    # チャット編集・再生成で再利用するため、送信時に適用したプロンプトテンプレート本文を保持する。
    prompt_template_content: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
    )
    is_create_library: bool = Field(
        default=False, sa_column=sa.Column(sa.Boolean, nullable=False, default=False)
    )


class MessageContent(SQLModel, table=True):
    """メッセージの回答本文（質問再生成・回答再生成のたびに更新される）。"""

    __tablename__ = "message_contents"

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    message_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    status: MessageContentStatus = Field(
        sa_column=sa.Column(sa.String(32), nullable=False),
    )
    question: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    answer: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    context: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
    )
    # 参照ファイルパスのリストをカンマ区切り文字列で保持する。
    file_paths: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
    )
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


class MessageFile(SQLModel, table=True):
    """メッセージ内容に紐づく添付ファイルの実体。

    カラム名は移植元に合わせ`message_id`だが、実際には`message_contents.id`を参照する。
    """

    __tablename__ = "message_files"

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    name: str = Field(max_length=255, nullable=False)
    type: str = Field(max_length=128, nullable=False)
    data: bytes = Field(sa_column=sa.Column(sa.LargeBinary, nullable=False))
    message_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("message_contents.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
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


class MessageFeedback(SQLModel, table=True):
    """メッセージへの評価。1メッセージにつき1件（`message_id`に一意制約）。"""

    __tablename__ = "message_feedbacks"
    __table_args__ = (
        sa.UniqueConstraint("message_id", name="uq_message_feedbacks_message_id"),
    )

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    user_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    message_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    rating: MessageRating = Field(sa_column=sa.Column(sa.String(16), nullable=False))
    # RAGインデックスへの参照。インデックス機能自体が未移植のため外部キー制約は付けない。
    index_id: str | None = Field(default=None, max_length=64)
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
