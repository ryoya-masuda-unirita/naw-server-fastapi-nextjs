from datetime import datetime
from enum import IntEnum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlmodel import Field, SQLModel

from app.core.jsonutil import utcnow


class FileStatus(IntEnum):
    """移植元 File.Status。@Enumerated 指定がないため DB には序数で保存される。"""

    ENABLE = 0
    DISABLE = 1
    DELETED = 2


class File(SQLModel, table=True):
    """移植元 File（files テーブル）。学習データのファイル単位。"""

    __tablename__ = "files"

    id: str = Field(sa_column=Column(String(36), primary_key=True))
    tenant_id: str = Field(sa_column=Column(String(32), nullable=False))
    name: str = Field(sa_column=Column(String(255), nullable=False))
    display_name: str | None = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )
    reference: str | None = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )
    status: int = Field(sa_column=Column(SmallInteger, nullable=False))
    user_id: str = Field(sa_column=Column(String(255), nullable=False))
    index_id: str = Field(sa_column=Column(String(32), nullable=False))
    storage_url: str | None = Field(
        default=None, sa_column=Column(String(2048), nullable=True)
    )
    feedback_id: str | None = Field(
        default=None, sa_column=Column(String(32), nullable=True)
    )
    room_id: str | None = Field(
        default=None, sa_column=Column(String(32), nullable=True)
    )
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    def touch(self) -> None:
        """更新日時を現在時刻（UTC）にする。

        移植元の @PreUpdate による自動更新の代わりに、更新処理から明示的に呼ぶ。
        """
        self.updated_at = utcnow()


class FilePart(SQLModel, table=True):
    """移植元 FilePart（file_parts テーブル）。Waha! 側で分割された断片。"""

    __tablename__ = "file_parts"
    __table_args__ = (
        UniqueConstraint("id", "file_id", name="uk_file_parts_id_file_id"),
        # 移植元（H2）は外部キーに自動でインデックスを作るが、SQLite は作らないため
        # 明示する（ファイルごとのパート取得・カスケード削除で使う）
        Index("file_parts_file_id_idx", "file_id"),
    )

    id: str = Field(sa_column=Column(String(36), primary_key=True))
    tenant_id: str = Field(sa_column=Column(String(32), nullable=False))
    file_id: str = Field(
        sa_column=Column(
            String(255),
            ForeignKey("files.id", name="fk_file_parts_file_id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
