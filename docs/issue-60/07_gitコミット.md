# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式作成 | `docs/issue-60/` |
| 2 | LibraryTag CRUD API実装 | `alembic/versions/014_add_library_tags.py`, `app/models/library_tag.py`, `app/schemas/library_tag.py`, `app/repositories/library_tag_repository.py`, `app/services/library_tag_service.py`, `app/routers/library_tags.py`, `app/main.py` |
| 3 | テスト追加 | `tests/integration/test_library_tags.py` |
| 4 | 動作確認結果記録 | `docs/issue-60/08_動作確認.md` |

## 各コミットメッセージ案

```
#60 issue-60 仕様駆動開発ドキュメントを作成
    - 00〜06のドキュメント一式を作成

#60 issue-60 LibraryTag CRUD APIを実装
    - library_tagsテーブルのマイグレーションを追加
    - LibraryTagモデル・スキーマ・リポジトリ・サービス・ルーターを実装
    - main.pyにルーターを登録

#60 issue-60 LibraryTag CRUD APIのテストを追加
    - 一覧・作成・更新・削除の統合テストを追加

#60 issue-60 動作確認結果を記録
    - curlによるAPI疎通確認結果を08_動作確認.mdに記録
```
