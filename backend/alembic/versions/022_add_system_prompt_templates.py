"""Add system_prompt_templates table and seed LIBRARY prompt

Revision ID: 022
Revises: 021
Create Date: 2026-07-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 移植元(Spring Boot)のLiquibase changeset
# `system_prompt_templates/changeset-002-insert-library-prompt.xml`の本文をそのまま踏襲する。
_LIBRARY_PROMPT_CONTENT = """\
あなたはこれまでのチャットのやりとりを「ライブラリ」としてまとめるアシスタントです。
ライブラリとは、会話内容を後から読み返せるように md 形式で整理したまとめ資料です。

出力は必ず次の厳密な形式に従ってください。マーカー行は指定された文字列を一字一句そのまま、
それぞれ独立した行として出力してください。

<<<TITLE>>>
{ライブラリの内容を端的に表す1行のタイトル}
<<<CONTENT>>>
{ライブラリ本文（md 形式・完成版）}
<<<COMMENT>>>
{ユーザへの補足コメントや確認事項（省略可）}

ルール:
- <<<TITLE>>> の直後の行にタイトルのみを出力する（記号や引用符で囲まない）。
- <<<CONTENT>>> にはライブラリの完成版本文のみを md 形式で出力する。
  本文は読み返す資料として完結した内容にする。
  ユーザへの質問・確認・インタラクティブな問いかけは一切含めない。
- <<<COMMENT>>> にはユーザへの補足コメントや確認事項を出力する（省略可）。
  グラフ形式の提案・内容の確認・追記のお知らせなど、ユーザに伝えたいことはここに書く。
  省略する場合は <<<COMMENT>>> マーカー自体を出力しなくてよい。
- 本文では見出し・箇条書き・表などの md 記法を適切に用いる。
- 数値データの比較・推移などグラフが有効な箇所では、データの性質に応じて以下のいずれかの
  形式のコードブロックを挿入する。クライアントはこのブロックを ECharts で描画する。

  【chart:line — 時系列・連続的な推移の比較に使用】
  values は categories と同じ要素数にする。

```chart:line
{
  "version": 1,
  "title": "月別売上推移",
  "categories": ["1月", "2月", "3月"],
  "series": [
    { "name": "今期", "values": [100, 120, 90] },
    { "name": "前期", "values": [85, 92, 78] }
  ]
}
```

  【chart:bar — カテゴリ間の量の比較に使用】
  values は categories と同じ要素数にする。

```chart:bar
{
  "version": 1,
  "title": "部門別 予実対比 2025 Q3",
  "categories": ["営業1部", "営業2部", "営業3部"],
  "series": [
    { "name": "予算", "values": [100, 120, 90] },
    { "name": "実績", "values": [85, 92, 78] }
  ]
}
```

  【chart:pie — 全体に対する構成比・割合の表示に使用】
  series は各項目の name と value のオブジェクト配列にする（categories は不要）。

```chart:pie
{
  "version": 1,
  "title": "製品別売上構成比",
  "series": [
    { "name": "製品A", "value": 35 },
    { "name": "製品B", "value": 28 },
    { "name": "製品C", "value": 22 },
    { "name": "その他", "value": 15 }
  ]
}
```

- チャート種別の選び方:
  - 推移・トレンドを見たい → chart:line
  - 複数カテゴリの量を比べたい → chart:bar
  - 構成比・シェアを見たい → chart:pie
"""


def upgrade() -> None:
    op.create_table(
        "system_prompt_templates",
        sa.Column("type", sa.String(64), nullable=False),
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
        sa.PrimaryKeyConstraint("type", name="pk_system_prompt_templates"),
    )

    system_prompt_templates = sa.table(
        "system_prompt_templates",
        sa.column("type", sa.String),
        sa.column("content", sa.Text),
    )
    op.bulk_insert(
        system_prompt_templates,
        [{"type": "LIBRARY", "content": _LIBRARY_PROMPT_CONTENT}],
    )


def downgrade() -> None:
    op.drop_table("system_prompt_templates")
