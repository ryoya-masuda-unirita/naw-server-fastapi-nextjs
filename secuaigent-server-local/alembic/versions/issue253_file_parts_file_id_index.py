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
    """file_parts.file_id にインデックス ``file_parts_file_id_idx`` を作る。

    SQLite は外部キー列にインデックスを自動で作らないため、移植元（H2）と同じく
    ファイル単位のパート取得とカスケード削除が全件走査にならないようにする。
    """
    # render_as_batch でもインデックスの追加はテーブルを作り直さずに行える
    op.create_index("file_parts_file_id_idx", "file_parts", ["file_id"])


def downgrade() -> None:
    """upgrade で作った ``file_parts_file_id_idx`` を削除する。"""
    op.drop_index("file_parts_file_id_idx", table_name="file_parts")
