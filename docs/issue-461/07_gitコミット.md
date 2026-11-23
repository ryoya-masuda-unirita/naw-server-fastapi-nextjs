# 07_gitコミット

| # | 内容 |
|---|---|
| 1 | 設計書（00〜07） |
| 2 | pgvector のクライアントと、RAG の検索の切り替え、compose、テスト |
| 3 | 動作確認と code-review の記録 |

```
#461 issue-461 クラウド側のベクトルの保存・検索を pgvector でも行えるようにする
    - PostgreSQL の接続先なら pgvector、https なら Azure AI Search で検索を切り替える
    - テナントごとの表の作成・保存・検索・ファイル単位の削除のクライアントを足す
    - ローカルの compose に pgvector のコンテナを足す
```
