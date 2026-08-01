"""[TEST-ONLY, Issue #197 No.2] 存在しないテーブルを参照して失敗させるダミーマイグレーション

Revision ID: 999
Revises: 022
Create Date: 2026-08-01

このファイルはIssue #197のCI/CD動作確認(マイグレーション失敗時に後続のbackendサービス
更新へ進まないことの確認)専用。確認後に削除する。
"""

from collections.abc import Sequence

from alembic import op

revision: str = "999"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 存在しないテーブルへのALTERで意図的に失敗させる
    op.execute("ALTER TABLE this_table_does_not_exist ADD COLUMN dummy_column text")


def downgrade() -> None:
    pass
