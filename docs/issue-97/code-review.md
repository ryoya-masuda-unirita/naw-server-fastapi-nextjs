# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/message_service.py` | 添付ファイル永続化(`save_attachment_files`)が失敗すると、`_persist_message_content`の例外が呼び出し元の`finally`節に伝播し、トークン使用量の永続化・`complete`イベント送出が行われなくなる | 対応済み |
| 2 | 🟡 注意 | `backend/app/repositories/message_content_repository.py` | `save_attachment_files`で保存後に`session.refresh`をファイル数分ループしており、docstringが謳う「N回のラウンドトリップにならない」という説明と矛盾するN+1が発生していた | 対応済み |
| 3 | 🟡 注意 | `backend/app/schemas/attachment.py` | `AttachmentFile.data`にサイズ上限（`max_length`等）の制約がない | 対応しない |
| 4 | 🔵 提案 | `backend/app/services/llm_chat_service.py`, `backend/app/services/message_service.py` | `_apply_attachment_files`内の`assert isinstance(content, str)`は、呼び出し順序という実行時に強制されない前提に依存しており、`python -O`実行時にはassertが無効化される | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/llm_chat_service.py`, `backend/app/services/message_service.py` | `_apply_additional_prompt`と`_apply_attachment_files`が同一ファイル内で「末尾から最後のuser発話を探す」ループをほぼ同じ形で2回実装している | 対応しない |

## 詳細

### 1. 添付ファイル永続化の失敗がトークン使用量永続化・completeイベント送出を巻き込んで失敗する問題（🔴 致命的）→ 対応済み

`MessageService.stream_message_content`の`event_stream`は、SSEストリーミング完了後に`finally`節で`_persist_message_content`→`_persist_token_usage`の順に永続化処理を呼び出す。`_persist_message_content`内で新たに追加した`MessageContentRepository.save_attachment_files`が例外を送出すると、その例外が`_persist_message_content`全体から呼び出し元へ伝播し、後続の`_persist_token_usage`（既にAzureへ課金が発生済みのトークン使用量の記録）と、`complete`イベントの送出（`yield _sse("complete", ...)`）の両方がスキップされてしまう。

直前のissue-93のcode-review対応（コミット`a81fb0c`）で「finally節で必ずMessageContent・トークン使用量を永続化する」という設計判断がなされていたにもかかわらず、本PRがその`finally`節の中に新しい失敗しうる処理（添付ファイル保存）を追加したことで、同種の問題を再導入していた。

`backend/app/services/message_service.py`の`_persist_message_content`内、`save_attachment_files`呼び出しを`try/except`で囲み、失敗時はログに記録したうえで`await new_session.rollback()`してから後続処理（Room更新・レスポンス構築）を継続するよう修正した。添付ファイルの保存失敗は、回答本文の永続化・トークン使用量の記録とは独立した問題として扱う。

回帰テスト`tests/unit/test_message_service.py::TestStreamMessageContentWithAttachmentFiles::test_persists_token_usage_and_emits_complete_even_when_attachment_save_fails`を追加し、`save_attachment_files`が例外を送出しても`complete`イベントが送出されること・セッションがrollbackされることを確認した。

### 2. `save_attachment_files`のN+1（不要なrefreshループ）（🟡 注意）→ 対応済み

`MessageContentRepository.save_attachment_files`は、`commit()`後に保存済み`MessageFile`をファイル数分`session.refresh()`していた。`MessageFile.id`は`default_factory=lambda: uuid.uuid4().hex`でPython側が挿入前に払い出し済みであり、呼び出し元（`MessageService._persist_message_content`）はレスポンス構築時に`name`/`type`/`data`（いずれも挿入前に確定済みの値）しか参照せず、サーバー側生成値である`created_at`/`updated_at`は使用しない。そのため`refresh`は不要であり、ファイル数分の追加`SELECT`（N+1）を発生させるだけだった。`backend/.claude/CLAUDE.md`の「複数行のUPDATE/DELETEをPythonのループで1件ずつ処理する非効率も避けること」というN+1回避方針に照らして修正が必要と判断し、`refresh`ループを削除した。docstringにも削除理由を追記した。

### 3. `AttachmentFile.data`にサイズ上限がない（🟡 注意）→ 対応しない

添付ファイルのバイナリ（`data: Base64Bytes`）には`max_length`等のサイズ制約を設けていない。悪意あるクライアントが巨大なBase64文字列を送信した場合、メモリ消費やDB肥大化のリスクがある。ただし、本リポジトリの既存のファイルアップロード実装（`backend/app/services/file_service.py`・`backend/app/schemas/file.py`）を確認した限り、既存の添付ファイル関連スキーマにも同様のサイズ制約は導入されておらず、リポジトリ全体で確立された既存の設計判断・上限値の慣習が存在しない。本Issueのスコープ外で独自にサイズ上限ポリシーを新設すると、既存実装との一貫性がない状態になるため、本PRでは対応せず、必要であれば別Issueでリポジトリ全体のアップロードサイズ制限方針として検討することとする。

### 4. `assert isinstance(content, str)`の前提が実行時に強制されない（🔵 提案）→ 対応しない

`_apply_attachment_files`（`llm_chat_service.py`・`message_service.py`の両方）は、`_apply_additional_prompt`適用直後に呼ばれることを前提に`assert isinstance(content, str)`としている。`python -O`実行時にはassert文が無効化されるため、理論上はこの前提が崩れた場合に検出できなくなる。ただし、本リポジトリの開発コマンド（`backend/.claude/CLAUDE.md`）は`uvicorn app.main:app --reload`で起動しており、`-O`フラグを使う運用は想定されていない。また、両関数はいずれも同一service内のprivateなモジュールレベル関数/staticmethodであり、呼び出し箇所は`stream_chat`/`stream_message_content`内の1箇所ずつに限定されているため、呼び出し順序が将来的に変わるリスクは低いと判断し、現状の実装を維持する。

### 5. `_apply_additional_prompt`と`_apply_attachment_files`のループ重複（🔵 提案）→ 対応しない

両関数は「末尾から最後の"user"ロール発話を探す」というループをほぼ同じ形で実装しており、同一ファイル内での重複が生じている。共通化は可能だが、`_apply_additional_prompt`は文字列連結、`_apply_attachment_files`は`str | list[dict]`への型変換と処理内容が異なり、無理に共通化すると条件分岐が増えて可読性が下がる。両関数とも短く単純なため、現状の重複を許容する。
