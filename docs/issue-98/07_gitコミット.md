# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-98/*` |
| 2 | tools(web_search/mcp)対応を実装 | `backend/app/core/llm_client.py`, `backend/app/schemas/llm.py`, `backend/app/schemas/message.py`, `backend/app/services/llm_chat_service.py`, `backend/app/services/message_service.py`, テストファイル一式 |
| 3 | タスクリストを更新 | `docs/issue-98/06_タスクリスト.md` |

## 各コミットメッセージ案

```
#98 issue-98 ドキュメント一式を作成
    - 00_チケット内容〜05_テスト詳細設計を作成
```

```
#98 issue-98 tools(Function Calling: web_search/mcp)対応を実装
    - Azure OpenAI Responses APIの組み込みツール(web_search/mcp)を
      tools指定時のみ呼び出すAzureLlmChatClientの新経路を追加
    - LlmChatRequest・MessageContentCreateRequestにtoolsを追加し、
      チャット送信・メッセージ送信の両方でtoolsをLLM呼び出しに渡すよう変更
    - 上記に対する単体テストを追加
```

```
#98 issue-98 タスクリストを更新
    - PR作成・code-review対応の完了をチェック済みに更新
```
