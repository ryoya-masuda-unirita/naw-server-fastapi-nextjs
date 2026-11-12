# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-239/00`〜`07` |
| 2 | 共通の仕組みと単体テスト | `backend/app/core/validation_messages.py`、`backend/tests/unit/test_validation_messages.py` |
| 3 | 各スキーマ・ルーターに文言を添え、独自チェックの文言を揃える | `backend/app/schemas/*.py`、`backend/app/routers/libraries.py`、`backend/tests/unit/test_request_validation_messages.py`、`backend/tests/integration/*.py` |
| 4 | 規約の更新・動作確認の記録 | `backend/.claude/CLAUDE.md`、`docs/issue-239/06`・`08` |
| 5 | code-review の結果 | `docs/issue-239/code-review.md`（指摘の修正があればその対象） |

## 各コミットメッセージ案

```text
#239 issue-239 入力チェックの文言を移植元に揃える設計ドキュメントを作成
    - 移植元の全 Request の制約とメッセージを一覧化し、backend の対応と突き合わせた
    - 既定文言（Hibernate Validator 8.0.3.Final の日本語）の確認結果と実装方式の判断理由を記載
```

```text
#239 issue-239 入力チェックの文言を項目ごとに指定する共通の仕組みを追加
    - ValidationMessages で項目の組み込みの制約のエラーを指定の文言に置き換える
    - RequestModel で項目の欠落のエラーを置き換える
```

```text
#239 issue-239 リクエストのスキーマの入力チェックの文言を移植元に揃える
    - 移植元の注釈の message（指定が無いものは日本語の既定文言）を各項目に添える
    - フィードバック・トークン使用量・埋め込み・アシスタント更新の独自チェックの文言を揃える
    - スキーマごと・API 経由の文言のテストを追加
```

```text
#239 issue-239 バリデーションの規約を更新し動作確認結果を記録
    - ValidationMessages・RequestModel の書き方を backend の規約に追記
```

```text
#239 issue-239 code-review の結果を記録
```
