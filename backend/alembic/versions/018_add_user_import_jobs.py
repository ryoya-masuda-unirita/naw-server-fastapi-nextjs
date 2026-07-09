"""Add user_import_jobs table

Revision ID: 018
Revises: 017
Create Date: 2026-07-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_import_jobs",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "PROCESSING",
                "COMPLETED",
                "FAILED",
                name="userimportjobstatus",
            ),
            nullable=False,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("storage_url", sa.String(2048), nullable=True),
        sa.Column("error_details", sa.Text(), nullable=True),
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
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_user_import_jobs"),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_user_import_jobs_tenant_id",
        ),
    )
    op.create_index("idx_user_import_jobs_tenant_id", "user_import_jobs", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_user_import_jobs_tenant_id", table_name="user_import_jobs")
    op.drop_table("user_import_jobs")
    sa.Enum(name="userimportjobstatus").drop(op.get_bind(), checkfirst=True)
