from datetime import datetime
from enum import StrEnum

from sqlalchemy import Column, DateTime, ForeignKey, Index, LargeBinary, String, Text
from sqlmodel import Field, SQLModel

from app.core.jsonutil import column_to_string_list, string_list_to_column, utcnow


class MessageContentStatus(StrEnum):
    OK = "OK"
    ERROR = "ERROR"


class MessageContent(SQLModel, table=True):
    """移植元 MessageContent（message_contents テーブル）。"""

    __tablename__ = "message_contents"
    __table_args__ = (
        Index("message_contents_message_id_idx", "message_id"),
        Index("message_contents_created_at_idx", "id", "created_at"),
    )

    id: str = Field(sa_column=Column(String(32), primary_key=True))
    message_id: str = Field(sa_column=Column(String(32), nullable=False, unique=True))
    status: str = Field(sa_column=Column(String(32), nullable=False))
    question: str = Field(sa_column=Column(Text, nullable=False))
    answer: str = Field(sa_column=Column(Text, nullable=False))
    context: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    file_paths: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    @property
    def reference_file_paths(self) -> list[str] | None:
        return column_to_string_list(self.file_paths)

    def set_reference_file_paths(self, paths: list[str] | None) -> None:
        # 移植元 setReferenceFilePaths と同じく、空なら空文字列を保存する
        self.file_paths = string_list_to_column(paths)

    def touch(self) -> None:
        """@PreUpdate 相当。"""
        self.updated_at = utcnow()


class MessageContentFile(SQLModel, table=True):
    """移植元 MessageContentFile（message_content_files テーブル）。"""

    __tablename__ = "message_content_files"

    id: str = Field(sa_column=Column(String(32), primary_key=True))
    message_content_id: str = Field(
        sa_column=Column(
            String(32),
            ForeignKey(
                "message_contents.id",
                name="fk_message_content_files_message_content_id",
                ondelete="CASCADE",
            ),
            nullable=False,
        )
    )
    name: str = Field(sa_column=Column(String(256), nullable=False))
    type: str = Field(sa_column=Column(String(128), nullable=False))
    data: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
