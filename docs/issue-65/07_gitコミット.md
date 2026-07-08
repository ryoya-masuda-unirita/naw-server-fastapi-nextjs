# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-65/*.md` |
| 2 | Library本体・中間テーブルのマイグレーション追加 | `alembic/versions/015_add_libraries.py` |
| 3 | Library関連モデル・リポジトリ・ルーム閲覧権限判定の追加 | `app/models/library.py`, `app/repositories/library_repository.py`, `app/repositories/share_library_repository.py`, `app/repositories/library_tag_mapping_repository.py`, `app/repositories/share_room_repository.py`, `app/core/room_access.py` |
| 4 | Libraryスキーマ・サービス・ルーターの追加 | `app/schemas/library.py`, `app/services/library_service.py`, `app/routers/libraries.py`, `app/main.py` |
| 5 | Libraryのテスト追加 | `tests/integration/test_libraries.py` |

## 各コミットメッセージ案

```
#65 issue-65 00_チケット内容.md を作成
```

```
#65 issue-65 Library本体・共有グループ・タグ紐づけの中間テーブルを追加
    - libraries / share_libraries / library_tag_mappings のマイグレーションを追加
```

```
#65 issue-65 Libraryモデル・リポジトリとルーム閲覧権限判定を追加
    - Library / ShareLibrary / LibraryTagMapping モデルを追加
    - ルームの閲覧権限（所有者・テナント管理者・共有グループ経由）判定をcore/room_access.pyに追加
```

```
#65 issue-65 Library取得・更新・削除APIを追加
    - GET /api/libraries, GET /api/libraries/{roomId}/list, GET /api/libraries/{libraryId} を追加
    - PUT /api/libraries/{libraryId}, DELETE /api/libraries/{libraryId} を追加
```

```
#65 issue-65 Library APIのテストを追加
```
