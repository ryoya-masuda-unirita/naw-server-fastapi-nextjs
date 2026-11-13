"""Split libraries.content into library_contents and make libraries.title nullable

Revision ID: issue307
Revises: 023
Create Date: 2026-11-13

他の未マージPRとマージ順によって down_revision の付け替えが必要。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "issue307"
down_revision: str | None = "023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 戻した後のスキーマはタイトル必須のため、スタブ（タイトルNULL）に入れる既定値。
DEFAULT_TITLE = "ライブラリ"


def upgrade() -> None:
    """本文を `library_contents` へ移し、`libraries.title` をNULL可にして `content` 列を削除する。

    Raises
    ------
    RuntimeError
        移行元と移行先の件数が一致しない場合（移植元のbackfillの検証と同じ）。
    """
    op.create_table(
        "library_contents",
        sa.Column("library_id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("library_id", name="pk_library_contents"),
        sa.ForeignKeyConstraint(
            ["library_id"],
            ["libraries.id"],
            ondelete="CASCADE",
            name="fk_library_contents_library_id",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_library_contents_tenant_id",
        ),
    )

    # 本文がNULLのライブラリは本文テーブルに行を作らない（移植元のbackfillと同じ）。
    op.execute(
        "INSERT INTO library_contents "
        "(library_id, tenant_id, content, created_at, updated_at) "
        "SELECT id, tenant_id, content, created_at, updated_at "
        "FROM libraries WHERE content IS NOT NULL"
    )
    connection = op.get_bind()
    source_count = connection.execute(
        sa.text("SELECT COUNT(*) FROM libraries WHERE content IS NOT NULL")
    ).scalar_one()
    migrated_count = connection.execute(
        sa.text("SELECT COUNT(*) FROM library_contents")
    ).scalar_one()
    if source_count != migrated_count:
        raise RuntimeError(
            "library_contents backfill mismatch: "
            f"libraries.content={source_count} library_contents={migrated_count}"
        )

    with op.batch_alter_table("libraries") as batch_op:
        batch_op.alter_column("title", existing_type=sa.String(255), nullable=True)
        batch_op.drop_column("content")


def downgrade() -> None:
    """本文を `libraries.content` に戻し、`library_contents` を削除する。

    タイトルがNULLのスタブには既定のタイトルを入れて残す。
    """
    with op.batch_alter_table("libraries") as batch_op:
        batch_op.add_column(sa.Column("content", sa.Text(), nullable=True))

    op.execute(
        "UPDATE libraries SET content = ("
        "SELECT lc.content FROM library_contents AS lc "
        "WHERE lc.library_id = libraries.id)"
    )
    op.execute(
        sa.text("UPDATE libraries SET title = :title WHERE title IS NULL").bindparams(
            title=DEFAULT_TITLE
        )
    )

    with op.batch_alter_table("libraries") as batch_op:
        batch_op.alter_column("title", existing_type=sa.String(255), nullable=False)

    op.drop_table("library_contents")
