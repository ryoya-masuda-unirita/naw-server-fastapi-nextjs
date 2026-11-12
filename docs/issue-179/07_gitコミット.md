# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントの作成 | `docs/issue-179/00`〜`07` |
| 2 | 検索パラメータ名を `search` に変更し、テストを追加 | `backend/app/routers/assistants.py`, `backend/tests/integration/test_assistants.py` |
| 3 | 動作確認結果の記録 | `docs/issue-179/06_タスクリスト.md`, `docs/issue-179/08_動作確認.md` |
| 4 | code-review 結果の記録（指摘対応を含む） | `docs/issue-179/code-review.md` ほか |

## 各コミットメッセージ案

```text
#179 issue-179 設計ドキュメントを作成
    - docs/issue-179 に 00〜07 を作成
```

```text
#179 issue-179 アシスタント一覧の検索パラメータ名を移植元と同じ search に変更
    - list_admin_assistants のクエリパラメータを q から search に変更
    - 名前・説明の部分一致、空文字、旧パラメータ名 q のテストを追加
```

```text
#179 issue-179 動作確認結果を記録
    - 08_動作確認.md に pytest の実行結果を記録
```

```text
#179 issue-179 code-review 結果を記録
    - code-review.md を作成
```
