# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを作成 | `docs/issue-227/00`〜`07` |
| 2 | 更新 API でハイフン付きのタグ ID を受け付ける | `backend/app/services/library_tag_service.py`、`backend/tests/integration/test_library_tags.py` |
| 3 | 動作確認結果を記録 | `docs/issue-227/06_タスクリスト.md`、`docs/issue-227/08_動作確認.md` |
| 4 | code-review 結果を記録（指摘対応があれば併せて） | `docs/issue-227/code-review.md` ほか |

## 各コミットメッセージ案

```
#227 issue-227 ライブラリタグ更新APIのタグID形式の設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#227 issue-227 ライブラリタグの更新APIでハイフン付きのタグIDを受け付ける
    - タグIDをUUIDとして解釈し保存形式（ハイフンなし32桁）に揃えてから取得する
    - 名前の重複チェックで取得したタグのIDを除外条件に使う
    - ハイフン付き・大文字・同名更新・重複・他テナントのテストを追加
```

```
#227 issue-227 動作確認結果を記録
    - 08_動作確認.mdにpytest・mypy・ruffの結果を記録
```
