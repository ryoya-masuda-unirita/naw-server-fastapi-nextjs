"""messages の (tenant_id, room_id) と parent_id の索引を足す

Revision ID: issue442
Revises: issue433
Create Date: 2026-11-23

どちらも、移植元（Liquibase）にはない、こちら独自の改善。

- `(tenant_id, room_id)`: ルームのメッセージ一覧・ルームのライブラリ一覧は、`tenant_id` と
  `room_id` の両方で絞り込む。外部キー `fk_messages_room_id`（`(room_id, tenant_id)` →
  `rooms`、ON DELETE CASCADE）の探索も、両方の等価条件。
- `parent_id`: 自己参照の外部キー `fk_messages_parent_id`（ON DELETE CASCADE）。PostgreSQL は
  外部キーの列に索引を自動では作らない。索引がないと、メッセージ・ルームを消すたびに、
  消す行ごとに `messages` 全体を走査する。450,000 件の計測で、ルームの削除が 422 ms →
  1.4 ms、メッセージの削除が 328 ms → 0.3 ms になった（`parent_id` の索引の効果）。

注意: 既存のマイグレーションに合わせ、`CONCURRENTLY` は使わない普通の `CREATE INDEX`。
作成の間、`messages` への書き込みが待たされるため、データが多い環境へ適用するときは、
利用が少ない時間帯に行う。
"""

from collections.abc import Sequence

from alembic import op

revision: str = "issue442"
down_revision: str | None = "issue433"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROOM_INDEX_NAME = "messages_tenant_id_room_id_idx"
PARENT_INDEX_NAME = "messages_parent_id_idx"


def upgrade() -> None:
    """`messages` の `(tenant_id, room_id)` と `parent_id` の索引を作る。"""
    op.create_index(ROOM_INDEX_NAME, "messages", ["tenant_id", "room_id"], unique=False)
    op.create_index(PARENT_INDEX_NAME, "messages", ["parent_id"], unique=False)


def downgrade() -> None:
    """`messages` の `parent_id` と `(tenant_id, room_id)` の索引を消す。"""
    op.drop_index(PARENT_INDEX_NAME, table_name="messages")
    op.drop_index(ROOM_INDEX_NAME, table_name="messages")
