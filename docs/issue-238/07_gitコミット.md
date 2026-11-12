# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-238/00`〜`07` |
| 2 | 実装とテスト | `backend/app/core/library_tag_id.py`、`backend/app/services/library_tag_service.py`、`backend/app/services/library_service.py`、`backend/tests/unit/test_library_tag_id.py`、`backend/tests/integration/test_library_tags.py`、`backend/tests/integration/test_libraries.py` |
| 3 | 動作確認の記録 | `docs/issue-238/06`・`08` |

## 各コミットメッセージ案

```text
#238 issue-238 ライブラリタグIDの正規化を横展開する設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
    - 移植元の一括削除・ライブラリ更新が UUID.fromString 失敗時に 400 を返すことを確認し、不正な形式の扱いを決めた
```

```text
#238 issue-238 ライブラリタグの一括削除とライブラリのタグ指定でハイフン付きIDを受け付ける
    - ライブラリタグIDの正規化を app/core/library_tag_id.py に共通化
    - 一括削除・ライブラリ更新のタグ指定でIDを保存形式に揃え、不正な形式は移植元と同じく400にする
    - ライブラリタグ更新APIの正規化を共通処理に置き換え（挙動は変えない）
    - 単体テスト・結合テストを追加
```

```text
#238 issue-238 動作確認結果を記録
    - 08_動作確認.md にテスト・mypy・ruff の結果を記録
    - 06_タスクリスト.md を更新
```
