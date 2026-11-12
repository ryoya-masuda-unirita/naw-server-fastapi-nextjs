# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-266/00`〜`07` |
| 2 | テストの日付を UTC 基準にする | `backend/tests/integration/test_credit_usage.py`・`test_files.py`・`test_tenants.py`・`test_users.py`・`test_groups.py` |
| 3 | 動作確認の記録 | `docs/issue-266/06`・`08` |
| 4 | code-review の結果 | `docs/issue-266/code-review.md`（指摘の修正があればその対象） |

## 各コミットメッセージ案

```text
#266 issue-266 テストの日付を UTC にそろえる設計ドキュメントを作成
    - 失敗の原因とアプリ側の日付の扱いの調査結果を記載
```

```text
#266 issue-266 結合テストのサブスクリプションの日付をアプリと同じ UTC 基準にする
    - date.today() を datetime.now(timezone.utc).date() に置き換える
    - ユーザー・グループのテストの、時差を避けるために開始日を 2 日前にずらす回避策を取り除く
```

```text
#266 issue-266 動作確認結果を記録
    - UTC+14 で修正前の失敗と修正後の成功、UTC での成功を記録
```

```text
#266 issue-266 code-review の結果を記録
```
