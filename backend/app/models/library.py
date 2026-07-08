import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class Library(SQLModel, table=True):
    """ライブラリ（チャット内容をMarkdown形式でまとめた資料）。

    移植元（Spring Boot）のLiquibase定義で`id`がuuid型のテーブルのため、
    他の多くのテーブル（hex文字列のstr(32)）と異なりuuid.UUIDで実装する。
    """

    __tablename__ = "libraries"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(
            sa.UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
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
    user_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    title: str = Field(max_length=255)
    content: str | None = Field(
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


class ShareLibrary(SQLModel, table=True):
    """ライブラリの共有先グループ中間テーブル。ライブラリ1件に対し複数グループを紐づける。"""

    __tablename__ = "share_libraries"
    __table_args__ = (
        sa.UniqueConstraint(
            "library_id", "group_id", name="uq_share_libraries_library_id_group_id"
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(
            sa.UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    library_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("libraries.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    group_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


class LibraryTagMapping(SQLModel, table=True):
    """ライブラリとタグ（library_tags）の紐づけ中間テーブル。"""

    __tablename__ = "library_tag_mappings"
    __table_args__ = (
        sa.UniqueConstraint(
            "library_id",
            "library_tag_id",
            name="uq_library_tag_mappings_library_id_tag_id",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(
            sa.UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    library_id: uuid.UUID = Field(
        sa_column=sa.Column(
            sa.UUID,
            sa.ForeignKey("libraries.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    library_tag_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("library_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
