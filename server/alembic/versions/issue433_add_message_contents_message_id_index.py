"""message_contents.message_id の索引を足す

Revision ID: issue433
Revises: issue309
Create Date: 2026-11-23

`message_contents.message_id` は `messages.id` への外部キー（ON DELETE CASCADE）だが、
PostgreSQL は外部キーの列に索引を自動では作らない。索引がないと、ルームのメッセージ一覧・
メッセージ ID からの本文取得・メッセージ削除時の CASCADE が、`message_contents` 全体を走査する。
移植元（Liquibase）にもない、こちら独自の改善。

列は `message_id` だけにする。`tenant_id` を先頭にすると、CASCADE の探索
（`WHERE message_id = ?`）に効かない。`message_id` はほぼ一意なので、`tenant_id` を足しても
絞り込みは変わらない。

注意: 既存のマイグレーションに合わせ、`CONCURRENTLY` は使わない普通の `CREATE INDEX`。
作成の間（件数が多いほど長い）、`message_contents` への書き込みが待たされるため、
データが多い環境へ適用するときは、利用が少ない時間帯に行う。
"""

from collections.abc import Sequence

from alembic import op

revision: str = "issue433"
down_revision: str | None = "issue309"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "message_contents_message_id_idx"


def upgrade() -> None:
    """`message_contents.message_id` の索引を作る。"""
    op.create_index(INDEX_NAME, "message_contents", ["message_id"], unique=False)


def downgrade() -> None:
    """`message_contents.message_id` の索引を消す。"""
    op.drop_index(INDEX_NAME, table_name="message_contents")
