# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/llm_chat_service.py` | ライブラリ永続化(`_persist_library`)が`try`ブロック内で呼ばれており、`message_service.py`とは異なりクライアント切断(`GeneratorExit`)時に永続化がスキップされうる | 対応済み |
| 2 | 🔵 提案 | `backend/app/services/message_service.py` | `router.flush()`のyieldループ実行中にクライアントが切断した場合、`library_title`/`library_content`が`None`のままとなりライブラリが永続化されない（MessageContentは「作成しました」等の案内文なしでOKステータス保存される） | 対応しない |

## 詳細

### 1. `LlmChatService.stream_chat`のライブラリ永続化がGeneratorExitに対して脆弱（🟡 注意）→ 対応済み

`message_service.py`の`stream_message_content`は、既存の回帰修正（`GeneratorExitで永続化がスキップされる問題を修正`）により、永続化処理を`finally`ブロックへ集約し、`GeneratorExit`（クライアント切断でStarletteがジェネレータを`aclose()`する際に送出される`BaseException`）が発生しても`MessageContent`・トークン使用量の永続化が必ず行われるよう設計されている。

しかし新規追加した`LlmChatService.stream_chat`のライブラリ生成モードでは、`_persist_library`の呼び出しが`try`ブロック内（`router.flush()`直後）に置かれていた。この場合、`router.flush()`のyieldループ実行中や`_persist_library`のawait中にクライアントが切断すると、`GeneratorExit`は`except Exception`で捕捉されないため`_persist_library`が実行されないまま処理が中断する。一方、`finally`ブロックの`_persist_token_usage`は実行されるため、「LLM呼び出し分のクレジットは消費されるが、生成されたライブラリは失われる」という非対称な状態が発生しうる。

**対応**: `library_title`/`library_content`を`router.flush()`直後（永続化前）に確定させたうえで、実際の`_persist_library`呼び出し自体を`finally`ブロックへ移動し、`library_title is not None and library_content is not None`をガード条件とした。これにより、タイトル・本文が確定した後の`yield`（デフォルト案内文・`message_stop`）実行中にクライアントが切断しても、`finally`到達時点で確定済みのタイトル・本文をもとにライブラリが永続化されるようになった（`message_service.py`と同等の堅牢性）。生成完了前（`router.flush()`到達前）の切断・例外では、これまで通り`library_title`/`library_content`が`None`のままのため永続化はスキップされ、「ストリーミングが正常に完了した場合のみライブラリを永続化する」という移植元Java版の挙動は維持している。

### 2. `MessageService.stream_message_content`のflushループ中断時、ライブラリ永続化がスキップされる（🔵 提案）→ 対応しない

`message_service.py`側も`_persist_library`自体は既に`finally`ブロックに置かれているが、その実行条件となる`library_title`/`library_content`は`router.flush()`のyieldループが完了した**後**に代入される。そのため、`flush()`が返す残りの`(区分, テキスト)`をyieldしている最中にクライアントが切断すると、`library_title`/`library_content`は`None`のままとなり、`finally`でのライブラリ永続化がスキップされる。一方`MessageContent`は（コメントが空なら）「〇〇を作成しました」という案内文つきで`OK`ステータスとして永続化されるため、案内文はあるのに参照先のライブラリが存在しない、という状態になりうる。

**対応しない理由**: これは「ストリーミング中の切断時は可能な範囲でベストエフォートに永続化する」という既存の非ライブラリ生成時の挙動（部分的な`text_delta`のみが`answer_text`として保存される）と同じ設計思想の範囲内であり、移植元Java版もそもそも`GeneratorExit`に相当する概念を持たず、ここまでの粒度でのクライアント切断対応は行っていない。発生条件も「タイトル・本文の生成完了後、`flush()`が返す最後の数チャンク（多くの場合0〜数文字程度）をyieldしている極めて短い時間枠内での切断」という非常に狭いタイミングに限られる。`llm_chat_service.py`（指摘1）と異なり、ここでのギャップは「トークン使用量は課金されるがライブラリは失われる」という非対称性ではなく（トークン使用量の永続化は本指摘の影響を受けない）、単に案内文だけが残るという軽微な不整合にとどまるため、本Issueのスコープでは対応を見送る。将来的に気になる場合は、`library_title`/`library_content`の確定タイミングを`flush()`呼び出し直後（yieldループの前）に早めることで同様の改善が可能。
