# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-69/*` |
| 2 | グループ×プロンプトテンプレート紐付け管理APIの実装 | `backend/app/schemas/prompt_template.py`, `backend/app/schemas/group.py`, `backend/app/repositories/prompt_template_repository.py`, `backend/app/repositories/group_prompt_template_repository.py`, `backend/app/services/group_service.py`, `backend/app/routers/groups.py` |
| 3 | テスト追加 | `backend/tests/integration/test_groups.py` |

## 各コミットメッセージ案

```
#69 issue-69 00_チケット内容.md を作成
```

```
#69 issue-69 GroupController のグループ×プロンプトテンプレート紐付け管理APIを移植
    - グループへのプロンプトテンプレート追加/削除/一覧取得の3エンドポイントを追加
    - グループ起点のリポジトリメソッド（一覧・単体取得・追加・削除）を追加
    - PromptTemplateResponseにaddedAtフィールドを追加
```

```
#69 issue-69 グループ×プロンプトテンプレート紐付けAPIのテストを追加
    - 一覧取得・検索・追加・削除・冪等性・権限のテストケースを追加
```
