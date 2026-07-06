"""Add password_histories table and remove users.password column

Revision ID: 002
Revises: 001
Create Date: 2026-06-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. password_histories テーブルを作成
    op.create_table(
        "password_histories",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("password", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_password_histories"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], name="fk_password_histories_tenant_id"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_password_histories_user_id",
        ),
    )
    op.create_index("ix_password_histories_user_id", "password_histories", ["user_id"])

    # 2. users テーブルから password カラムを削除
    op.drop_column("users", "password")


def downgrade() -> None:
    # password カラムを復元
    op.add_column(
        "users",
        sa.Column("password", sa.String(255), nullable=False),
    )

    # password_histories テーブルを削除
    op.drop_table("password_histories")
