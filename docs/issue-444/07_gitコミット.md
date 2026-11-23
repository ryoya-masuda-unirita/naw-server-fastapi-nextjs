# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計書（00〜02） | `docs/issue-444/00`〜`02` |
| 2 | 設計書（03〜07） | `docs/issue-444/03`〜`07` |
| 3 | Bearer だけを送るようにし、テストと README を直す | `bedrock.py`・`test_bedrock_transport.py`・`test_generative_ai_workflow.py`・`generative-ai-adapter/README.md` |
| 4 | #436 の設計書に訂正を追記し、動作確認を作成する | `docs/issue-436/`・`docs/issue-444/06`・`08` |

## 各コミットメッセージ案

```
#444 issue-444 Bedrock（Claude）の呼び出しで x-api-key を送らず Bearer だけにする
    - Mantle が 2 種類の認証ヘッダーを 401 で拒否するため、request_target を Bearer だけにする
    - core と waha-emulator のテストを、x-api-key が付かないことの確認に直す
    - README の認証の記述を直す
```
