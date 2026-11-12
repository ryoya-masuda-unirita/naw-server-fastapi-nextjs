# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 調査結果（BLOCKED の記録） | `docs/issue-171/00`・`01`（コミット済み） |
| 2 | 案 C の設計ドキュメント | `docs/issue-171/00`〜`07` |
| 3 | テンプレート名の上限検証とテスト | `backend/app/models/prompt_template.py`、`backend/app/schemas/prompt_template.py`、`backend/tests/integration/test_prompt_templates.py` |
| 4 | 動作確認の記録 | `docs/issue-171/06`・`08` |

## 各コミットメッセージ案

```text
#171 issue-171 テンプレート名の上限検証（案C）の設計ドキュメントを作成
    - ユーザー決定の案Cを01_要件定義.mdに反映
    - 02_基本設計.md〜07_gitコミット.md を作成
```

```text
#171 issue-171 テンプレート作成・更新でテンプレート名が32文字を超えると422を返す
    - モデルにNAME_MAX_LENGTH（移植元DBカラムvarchar(32)）を定義しカラム定義で使用
    - PromptTemplateCreateRequest.name に同じ上限を設定
    - 作成・更新の境界値（マルチバイト含む）の結合テストを追加
```

```text
#171 issue-171 動作確認結果を記録
    - 08_動作確認.md に pytest の実行結果を記録
```
