# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントの追加 | `docs/issue-245/00`〜`07` |
| 2 | 履歴添付件数チェックの削除・本文空文字の許可とテスト | `backend/app/schemas/message.py`、`backend/tests/unit/test_message_schemas.py`、`backend/tests/unit/test_message_service.py`、`backend/tests/integration/test_messages.py` |
| 3 | 動作確認結果の記録 | `docs/issue-245/06_タスクリスト.md`、`docs/issue-245/08_動作確認.md` |

## 各コミットメッセージ案

```
#245 issue-245 履歴添付件数チェック削除と本文空文字許可の設計ドキュメントを追加する
    - docs/issue-245 に 00〜07 を追加
```

```
#245 issue-245 メッセージ送信で履歴の添付件数チェックを外し本文の空文字を許可する
    - MessageContentCreateRequest の _validate_history_attachment_count を削除（移植元の javax の @AssertTrue は実行時に評価されない）
    - userInput の min_length=1 を外し、項目の必須だけを残す（移植元の @NotNull 相当）
    - 件数不一致で 400 を固定していたテストを、受け付けることを確認するテストに書き換え
    - 空文字の userInput と画像を LLM に送り、質問文を空文字で保存することを結合テストで確認
```

```
#245 issue-245 動作確認結果を記録する
    - 08_動作確認.md に pytest・mypy・ruff の実行結果を記録
```
