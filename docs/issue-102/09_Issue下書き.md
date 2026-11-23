# 09_Issue下書き

起票はしていない（人が判断する）。根拠は [08_動作確認.md](./08_動作確認.md)。

## 1. `/api/llm/chat` で、クライアントが `message_stop` の直後に接続を閉じるとトークン使用量が記録されない（backend）

- 対象: `backend/app/services/llm_chat_service.py`（`event_stream()` の `finally` → `_persist_token_usage`）
- 症状: アダプタ（`generative-ai-core` の SecuAiGent ベンダー）は `message_stop` を読むと接続を閉じる。この経路で `/api/llm/chat` を呼ぶと、`message_stop`（入力 11・出力 7）は返るのに `token_usages` に行ができない（2 回とも）。同じ呼び出しを最後まで読むと記録される
- 再現: `message_stop` を読んだ直後に閉じるクライアントで `POST /api/llm/chat`（deployName・messageId 付き）を呼ぶ。直後の `select * from token_usages` が空
- 原因の見立て（コードを読んだ範囲。未検証）: 切断でリクエストのタスクがキャンセルされ、`finally` 内の `await` による記録（新規セッションのコミット）が中断される。直後に `connection is closed`（`InterfaceError`）の 500 を 1 回観測した。コミットの途中で中断された接続がプールに戻った可能性がある
- 移植元: `LlmChatService.streamAndPersist` は別スレッドで動き、切断の影響を受けずに `persistTokenUsageInNewTransaction` を呼ぶ
- 影響: SECURE の SecuAiGent ベンダー経由のチャットで、使用量・クレジットが記録されない
- 修正案: 記録を `asyncio.shield` や、キャンセルされないバックグラウンドのタスクで行う。SSE 本体（`message_service.py` の `stream_message_content` の `finally` も同じ構造）への波及も確かめる。切断を再現するテストを足す

## 2. 確認用の通し環境がない（onprem・テスト）

- 症状: SECURE の通しの確認には、backend の `llm/chat` の先の LLM（Azure OpenAI の偽物）、エミュレーターの SecuAiGent ベンダーのワークフロー定義、loginKey 付きユーザー、LOCAL_SERVER の URL の書き換えを手で用意する必要があった。`onprem/cloud-seed.sql` は Echo のアシスタント 1 つだけで、`onprem/README.md` に SecuAiGent ベンダーの手順がない
- 修正案: `onprem/` に SecuAiGent ベンダー用のワークフロー例と cloud-seed の追記（2 つ目のアシスタント・loginKey）を足し、README に手順を書く。偽の Azure OpenAI を compose のサービスにするかは要判断（優先度は低い）

## 3. （要判断）React の画面からの通しが未確認

- 症状: ブラウザ自動操作が `localhost` に到達できず、画面での確認ができなかった。コードと API の再現だけで、画面の結合は見ていない
- 修正案: ユーザーが `onprem/` と backend を起動して手動で確認する、または `e2e-explorer` に SECURE の担当範囲を足す。Issue にせず手順の共有で足りる可能性が高い

## 備考（Issue にしない）

- `GET /api/auth` のレスポンスに `tenantId` がないのは既知（CLAUDE.md 記載）。textData の `tenantId` は `sessionStorage` 由来で、ログイン画面に入力欄があれば成立する
- 同じ `messageId` で、`messageContentId` なしに server-local へ再送すると 500（`message_contents.message_id` の UNIQUE 違反）。移植元も同じ制約で、再生成は `messageContentId` を指定する前提と考えられるため、不具合とは扱っていない
