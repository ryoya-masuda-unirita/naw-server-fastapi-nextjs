"""Add BEDROCK_EMBEDDING to endpointtype and aimodelendpointtype enums

Revision ID: issue460
Revises: issue442
Create Date: 2026-11-23

"""

from collections.abc import Sequence

from alembic import op

revision: str = "issue460"
down_revision: str | None = "issue442"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQLのenum型への値追加は同一トランザクション内では新値を使用できないため、
    # 型定義の変更のみ行う（この移行内でBEDROCK_EMBEDDINGの値を挿入・参照はしない）。
    """マイグレーションを適用する。"""
    op.execute("ALTER TYPE endpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_EMBEDDING'")
    op.execute(
        "ALTER TYPE aimodelendpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_EMBEDDING'"
    )


def downgrade() -> None:
    # PostgreSQLはenumから値を削除するネイティブ手段を提供していないため、
    # 旧enumを作り直す。BEDROCK_EMBEDDINGの行が残っていると旧enumへのcastが失敗するため、
    # 先に削除する（旧スキーマでは表現できず、残しても使えない行）。
    """マイグレーションを取り消す。"""
    op.execute("DELETE FROM tenant_endpoints WHERE type = 'BEDROCK_EMBEDDING'")
    op.execute("DELETE FROM ai_models WHERE endpoint_type = 'BEDROCK_EMBEDDING'")

    op.execute("ALTER TYPE endpointtype RENAME TO endpointtype_old")
    op.execute(
        "CREATE TYPE endpointtype AS ENUM ("
        "'LOCAL_SERVER', 'VDB', 'AZURE_OPENAI_CHAT', 'CLAUDE_CHAT', 'GEMINI_CHAT', "
        "'OPENAI_CHAT', 'OPENAI_WEB_SEARCH_CHAT', 'AZURE_OPENAI_EMBEDDING', "
        "'BEDROCK_CHAT'"
        ")"
    )
    op.execute(
        "ALTER TABLE tenant_endpoints ALTER COLUMN type TYPE endpointtype "
        "USING type::text::endpointtype"
    )
    op.execute("DROP TYPE endpointtype_old")

    op.execute("ALTER TYPE aimodelendpointtype RENAME TO aimodelendpointtype_old")
    op.execute(
        "CREATE TYPE aimodelendpointtype AS ENUM ("
        "'AZURE_OPENAI_CHAT', 'CLAUDE_CHAT', 'GEMINI_CHAT', 'OPENAI_CHAT', "
        "'OPENAI_WEB_SEARCH_CHAT', 'AZURE_OPENAI_EMBEDDING', 'BEDROCK_CHAT'"
        ")"
    )
    op.execute(
        "ALTER TABLE ai_models ALTER COLUMN endpoint_type TYPE aimodelendpointtype "
        "USING endpoint_type::text::aimodelendpointtype"
    )
    op.execute("DROP TYPE aimodelendpointtype_old")
