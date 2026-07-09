"""Add libraries, share_libraries and library_tag_mappings tables

Revision ID: 016
Revises: 015
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "libraries",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("message_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_libraries"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_libraries_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE",
            name="fk_libraries_message_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_libraries_user_id",
        ),
    )

    op.create_table(
        "share_libraries",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("library_id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.String(32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_share_libraries"),
        sa.UniqueConstraint(
            "library_id", "group_id", name="uq_share_libraries_library_id_group_id"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_share_libraries_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["library_id"],
            ["libraries.id"],
            ondelete="CASCADE",
            name="fk_share_libraries_library_id",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            ondelete="CASCADE",
            name="fk_share_libraries_group_id",
        ),
    )

    op.create_table(
        "library_tag_mappings",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("library_id", sa.UUID(), nullable=False),
        # library_tags.id は移植元Liquibase定義ではuuid型だが、既存のFastAPI実装
        # （app/models/library_tag.py、issue #60）がhex文字列(varchar(32))で
        # 移植済みのため、それに合わせてstring(32)にする（uuidにすると既存テーブルと
        # 型不一致でFK制約が張れない）。
        sa.Column("library_tag_id", sa.String(32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_library_tag_mappings"),
        sa.UniqueConstraint(
            "library_id",
            "library_tag_id",
            name="uq_library_tag_mappings_library_id_tag_id",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_library_tag_mappings_tenant_id",
        ),
        sa.ForeignKeyConstraint(
            ["library_id"],
            ["libraries.id"],
            ondelete="CASCADE",
            name="fk_library_tag_mappings_library_id",
        ),
        sa.ForeignKeyConstraint(
            ["library_tag_id"],
            ["library_tags.id"],
            ondelete="CASCADE",
            name="fk_library_tag_mappings_tag_id",
        ),
    )


def downgrade() -> None:
    op.drop_table("library_tag_mappings")
    op.drop_table("share_libraries")
    op.drop_table("libraries")
