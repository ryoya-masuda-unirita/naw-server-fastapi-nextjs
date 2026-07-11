# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue docs を作成 | `docs/issue-137/` |
| 2 | Azure OpenAI 設定を追加し LLM クライアントへ適用 | `backend/app/core/config.py`, `backend/app/core/llm_client.py`, `backend/tests/unit/test_config.py`, `backend/tests/unit/test_llm_client.py` |

## 各コミットメッセージ案

```text
#137 issue-137 Azure OpenAI設定の設計ドキュメントを作成
    - 00_チケット内容.md〜08_動作確認.mdの雛形を作成
    - 要件定義・基本設計・詳細設計・テスト設計を記載
```

```text
#137 issue-137 Azure OpenAI設定をFastAPIに追加
    - Azure OpenAI APIバージョン設定を追加
    - LLMクライアントが設定値を使うよう変更
    - 設定とクライアント生成引数の単体テストを追加
```
