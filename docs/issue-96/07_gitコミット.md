# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式(00〜08)を作成 | `docs/issue-96/` |
| 2 | SAAS_RAG対応（ベクトルDBクライアント層・RAGコンテキスト構築・テスト） | `backend/pyproject.toml`, `backend/app/core/vector_store.py`, `backend/app/repositories/file_repository.py`, `backend/app/services/message_service.py`, `backend/tests/unit/test_vector_store.py`, `backend/tests/unit/test_message_service.py`, `backend/uv.lock` |

## 各コミットメッセージ案

```
#96 issue-96 ドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成
```

```
#96 issue-96 SAAS_RAG(ベクトル検索付きアシスタント)に対応
    - Azure AI Searchへの類似検索を行うベクトルDBクライアント層を新規実装
    - message_serviceのstream_message_contentでSAAS_RAGアシスタントのRAGコンテキスト構築・永続化に対応
    - ファイルの複数ID一括取得メソッドを追加しN+1を回避
    - RAG分岐の正常系・異常系のユニットテストを追加
```
