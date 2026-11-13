"""users.login_key を login_key_hash（SHA-256）に置き換える

Revision ID: issue309
Revises: 023
Create Date: 2026-11-13

移植元 changeset-009-replace-login-key-with-hash.xml に合わせる。DB が漏れてもキーで
なりすまされないよう平文の列を無くす。既存の平文キーはハッシュに変換せず捨てる
（移植元 Q-03。再発行が必要になる）。

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "issue309"
down_revision: str | None = "023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNIQUE_NAME = "uq_users_tenant_id_login_key_hash"


def upgrade() -> None:
    """login_key_hash 列と一意制約を追加し、login_key 列を削除する。"""
    op.add_column("users", sa.Column("login_key_hash", sa.String(64), nullable=True))
    op.create_unique_constraint(UNIQUE_NAME, "users", ["tenant_id", "login_key_hash"])
    op.drop_column("users", "login_key")


def downgrade() -> None:
    """login_key 列を戻し、login_key_hash 列と一意制約を削除する（キーの中身は戻らない）。"""
    op.add_column("users", sa.Column("login_key", sa.String(32), nullable=True))
    op.drop_constraint(UNIQUE_NAME, "users", type_="unique")
    op.drop_column("users", "login_key_hash")
