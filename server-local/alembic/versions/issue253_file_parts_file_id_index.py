"""file_parts.file_id にインデックスを追加する

移植元（H2）は外部キーの列に自動でインデックスを作るが、SQLite は作らない。
ファイルごとのパート取得と、ファイル削除時のカスケード削除で使う（#253）。

Revision ID: issue253
Revises: 0001
Create Date: 2026-11-13

"""

from collections.abc import Sequence

from alembic import op

revision: str = "issue253"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # render_as_batch でもインデックスの追加はテーブルを作り直さずに行える
    op.create_index("file_parts_file_id_idx", "file_parts", ["file_id"])


def downgrade() -> None:
    op.drop_index("file_parts_file_id_idx", table_name="file_parts")
