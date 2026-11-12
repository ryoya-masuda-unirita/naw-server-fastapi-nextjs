# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント（00〜07）の作成 | `docs/issue-251/00`〜`07` |
| 2 | Waha! 待ちの間に書き込みロックを持たないようにする（実装・テスト・README） | `server-local/app/services/file_service.py`、`server-local/tests/conftest.py`、`server-local/tests/test_file_service_db_lock.py`、`server-local/tests/test_indexes_router.py`、`server-local/README.md` |
| 3 | 動作確認の記録 | `docs/issue-251/08_動作確認.md` |
| 4 | code-review の結果と対応 | `docs/issue-251/code-review.md` ほか |

## 各コミットメッセージ案

```text
#251 issue-251 ファイル差し替えのDBロック対応のドキュメントを作成する
    - 00_チケット内容〜07_gitコミットを作成
```

```text
#251 issue-251 Waha!の処理を待つ間にSQLiteの書き込みロックを持たないようにする
    - 差し替えはWaha!の削除・登録を終えてから1回のトランザクションでDBを更新する
    - 削除はWaha!のセッション終了まで済ませてからDBを更新する
    - 物理削除をID条件のDELETEにし、待機中に同じファイルが消されても失敗しないようにする
    - Waha!待ちの間に別セッションで書き込めることのテストを追加
    - READMEの移植元との違いに追記
```

```text
#251 issue-251 動作確認結果を記録する
    - 08_動作確認.md にテスト結果を記録
```
