# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成（03〜07） | `docs/issue-36/03_詳細設計.md`〜`07_gitコミット.md` |
| 2 | モデル・マイグレーション追加 | `app/models/prompt_template.py`、`app/models/group.py`（docstring修正）、`alembic/versions/007_add_prompt_templates.py` |
| 3 | スキーマ・リポジトリ追加 | `app/schemas/prompt_template.py`、`app/repositories/prompt_template_repository.py`、`app/repositories/group_prompt_template_repository.py`、`app/repositories/group_repository.py` |
| 4 | サービス・ルーター追加 | `app/services/prompt_template_service.py`、`app/routers/prompt_templates.py`、`app/main.py` |
| 5 | シードデータ追加 | `seed.sql` |
| 6 | テスト追加 | `tests/integration/test_prompt_templates.py`、`tests/unit/test_prompt_template_service.py` |
| 7 | 動作確認記録 | `docs/issue-36/08_動作確認.md` |

## 各コミットメッセージ案

```
#36 issue-36 プロンプトテンプレート管理APIの詳細設計・テスト設計を作成
    - 03_詳細設計.md〜07_gitコミット.mdを作成
```

```
#36 issue-36 PromptTemplate・GroupPromptTemplateのモデルとマイグレーションを追加
    - prompt_templates・groups_prompt_templatesテーブルを作成するマイグレーションを追加
    - GroupUserのdocstringを実装状況に合わせて修正
```

```
#36 issue-36 プロンプトテンプレートのスキーマ・リポジトリを追加
    - 一般ユーザー向け・管理者向け一覧取得のクエリをリポジトリに実装
    - グループ紐付け用の中間テーブルリポジトリを追加
```

```
#36 issue-36 プロンプトテンプレート管理APIのサービス・ルーターを追加
    - 一覧取得・作成・更新・削除の5エンドポイントを実装
    - main.pyにルーターを登録
```

```
#36 issue-36 プロンプトテンプレートの動作確認用シードデータを追加
    - グループ紐付けありのテンプレート、なしのテンプレートを追加
```

```
#36 issue-36 プロンプトテンプレート管理APIのテストを追加
    - 一覧取得（一般・管理者）・作成・更新・削除の結合テストを追加
    - 管理者スコープ決定ロジックの単体テストを追加
```

```
#36 issue-36 動作確認結果を記録
    - frontend-angular経由での一覧・作成・更新・削除の確認結果を記録
```
