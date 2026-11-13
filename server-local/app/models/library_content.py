from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text
from sqlmodel import Field, SQLModel

from app.core.jsonutil import utcnow


class LibraryContent(SQLModel, table=True):
    """移植元 LibraryContent（library_contents テーブル）。生成したライブラリ本文。"""

    __tablename__ = "library_contents"

    library_id: str = Field(sa_column=Column(String(36), primary_key=True))
    content: str = Field(sa_column=Column(Text, nullable=False))
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
