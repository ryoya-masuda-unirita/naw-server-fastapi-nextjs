# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを作成 | `docs/issue-226/00`〜`07` |
| 2 | 削除済みファイルの更新・ダウンロードを拒否し、RAG から除外 | `backend/app/services/file_service.py`、`backend/app/repositories/file_repository.py`、`backend/app/services/message_service.py`、`backend/tests/**` |
| 3 | 動作確認結果を記録 | `docs/issue-226/06_タスクリスト.md`、`docs/issue-226/08_動作確認.md` |
| 4 | code-review 結果を記録（指摘対応があれば併せて） | `docs/issue-226/code-review.md` ほか |

## 各コミットメッセージ案

```
#226 issue-226 論理削除した学習データファイルの扱いの設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#226 issue-226 削除済みの学習データファイルの更新・ダウンロードを拒否しRAGから除外
    - 更新APIは移植元NAW-1375と同じく削除済みならどの更新も400で拒否する
    - ダウンロードAPIは削除済みなら500ではなく400を返す
    - RAGの検索結果をファイルに解決するときに削除済みを除く
```

```
#226 issue-226 動作確認結果を記録
    - 08_動作確認.mdにpytest・mypy・ruffの結果を記録
```
