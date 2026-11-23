# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計書（00〜02） | `docs/issue-460/00`〜`02` |
| 2 | 設計書（03〜07） | `docs/issue-460/03`〜`07` |
| 3 | Bedrock の埋め込みを足し、使い分け、テストを追加する | `server/` |
| 4 | 動作確認と code-review の記録 | `docs/issue-460/06`・`08`・`code-review.md` |

## コミットメッセージ案

```
#460 issue-460 クラウド側の埋め込みを Bedrock（Titan）でも行えるようにする
    - 接続先の種別 BEDROCK_EMBEDDING と、Bedrock Runtime を Bearer で呼ぶクライアントを足す
    - RAG の質問の埋め込みと埋め込み API で、種別に応じて Azure と Bedrock を使い分ける
    - 次元数が 1536 でないときは、分かる失敗にする
```
