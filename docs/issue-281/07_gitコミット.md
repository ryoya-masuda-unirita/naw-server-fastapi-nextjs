# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-281/00`〜`07` |
| 2 | カテゴリの 404 文言を移植元に揃える | `backend/app/services/assistant_category_service.py`、`backend/tests/unit/test_assistant_category_service.py`、`backend/tests/integration/test_assistant_categories.py` |
| 3 | 動作確認の記録 | `docs/issue-281/06`・`08` |
| 4 | code-review の結果 | `docs/issue-281/code-review.md` |

## 各コミットメッセージ案

```text
#281 issue-281 移植元との突き合わせ結果と設計ドキュメントを作成
    - tags・一般ユーザー用token-usages・usage-limitが移植元serverに無いことを記載
    - assistant-categories/optionsが単体取得の404になることを記載
```

```text
#281 issue-281 アシスタントカテゴリが見つからない場合の文言を移植元に揃える
    - 単体取得・削除はid:{id}、更新はid: {id}の文言にする
    - /optionsが単体取得として404を返すことを結合テストで確認する
```
