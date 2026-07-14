"""Add BEDROCK_CHAT to endpointtype and aimodelendpointtype enums

Revision ID: 023
Revises: 022
Create Date: 2026-07-14

"""

from collections.abc import Sequence

from alembic import op

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQLのenum型への値追加は同一トランザクション内では新値を使用できないため、
    # 型定義の変更のみ行う（この移行内でBEDROCK_CHATの値を挿入・参照はしない）。
    op.execute("ALTER TYPE endpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_CHAT'")
    op.execute("ALTER TYPE aimodelendpointtype ADD VALUE IF NOT EXISTS 'BEDROCK_CHAT'")


def downgrade() -> None:
    # PostgreSQLはenumから値を削除するネイティブ手段を提供していないため、
    # ダウングレードは既存の型を再作成する形で対応する。
    op.execute("ALTER TYPE endpointtype RENAME TO endpointtype_old")
    op.execute(
        "CREATE TYPE endpointtype AS ENUM ("
        "'LOCAL_SERVER', 'VDB', 'AZURE_OPENAI_CHAT', 'CLAUDE_CHAT', 'GEMINI_CHAT', "
        "'OPENAI_CHAT', 'OPENAI_WEB_SEARCH_CHAT', 'AZURE_OPENAI_EMBEDDING'"
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
        "'OPENAI_WEB_SEARCH_CHAT', 'AZURE_OPENAI_EMBEDDING'"
        ")"
    )
    op.execute(
        "ALTER TABLE ai_models ALTER COLUMN endpoint_type TYPE aimodelendpointtype "
        "USING endpoint_type::text::aimodelendpointtype"
    )
    op.execute("DROP TYPE aimodelendpointtype_old")
