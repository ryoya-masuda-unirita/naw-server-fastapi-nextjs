# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-283/*` |
| 2 | 実装・テスト・README・ライブラリ追加 | `frontend/**` |

## 各コミットメッセージ案

```
#283 issue-283 チャットの土台（Markdown・チャート・mermaid描画、SSE受信、messages・rooms store）をReactに移植
    - MarkdownView（marked + DOMPurify）、echarts・mermaid のコードブロック描画を追加
    - streamMessageContent（SSE、接続先の切り替え）と api-client の omitTenantId を追加
    - messages・rooms の store、useAssistants、useChatActions を追加
    - 使い方を frontend/src/features/chat/README.md にまとめた
```
