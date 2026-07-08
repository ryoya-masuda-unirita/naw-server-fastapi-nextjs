# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `shares`/`share_rooms` テーブルとモデルを追加 | `alembic/versions/013_add_shares.py`、`app/models/share.py` |
| 2 | 共有リンクAPIのスキーマとリポジトリを追加 | `app/schemas/share.py`、`app/repositories/share_repository.py`、`app/repositories/share_room_repository.py` |
| 3 | 共有リンクAPI（作成・アクセス解決・削除）を実装 | `app/services/share_service.py`、`app/routers/shares.py`、`app/main.py` |
| 4 | 共有リンクAPIのテストを追加 | `tests/integration/test_shares.py` |
| 5 | `06_タスクリスト.md`・`08_動作確認.md` を更新 | `docs/issue-50/06_タスクリスト.md`、`docs/issue-50/08_動作確認.md` |

（code-reviewの指摘対応が発生した場合は別途コミットを追加する）

## 各コミットメッセージ案

```
#50 issue-50 shares・share_roomsテーブルとモデルを追加
    - alembicマイグレーション013で2テーブルを作成
    - SQLModelでShare・ShareRoomを定義
```

```
#50 issue-50 共有リンクAPIのスキーマとリポジトリを追加
    - schemas/share.pyに作成・アクセス解決のリクエスト/レスポンススキーマを追加
    - repositories/に共有リンク・共有先グループのDBアクセスを追加
```

```
#50 issue-50 チャットルーム共有リンクAPIを実装
    - services/share_service.pyにルーム所有権チェック・共有先グループアクセス判定を実装
    - routers/shares.pyに作成・アクセス解決・削除のエンドポイントを追加
    - main.pyにルーターを登録
```

```
#50 issue-50 共有リンクAPIのテストを追加
    - test_shares.pyに正常系・異常系・テナント分離・権限チェックのテストを追加
```

```
#50 issue-50 06_タスクリスト・08_動作確認.mdを更新
    - 実装・テストタスクを完了に更新
    - 動作確認結果を記録
```
