# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 03〜08ドキュメントの作成 | `docs/issue-104-NAW-1192/03_詳細設計.md`〜`08_動作確認.md` |
| 2 | アシスタント削除時のメッセージ保持を検証する回帰テストを追加 | `backend/tests/integration/test_assistants.py` |
| 3（必要時） | code-review指摘対応 | 指摘内容に応じる |

## 各コミットメッセージ案

```
#104 issue-104 NAW-1192 03〜08ドキュメントを作成
    - 詳細設計・テスト設計・テスト詳細設計・タスクリスト・gitコミット・動作確認ドキュメントを作成
    - 着手時点の調査で、FastAPI側は既にNAW-1192相当のFK制約（assistant_id: SET NULL、default_assistant_id: RESTRICT）を実装済みと判明したため、実装方針を回帰テスト追加に限定する旨を記載
```

```
#104 issue-104 NAW-1192 アシスタント削除時にメッセージが消えないことを検証する回帰テストを追加
    - TestDeleteAssistantにtest_delete_assistant_keeps_messages_and_sets_assistant_id_nullを追加
    - 削除対象アシスタントを使用するメッセージが、削除後もassistant_id=NULLで残ることを検証
```
