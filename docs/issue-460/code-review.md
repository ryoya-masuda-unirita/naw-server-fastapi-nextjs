# code-review 結果

`/code-review medium` の結果。各指摘を実際のコードで確かめた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 重要 | `llm_embedding_service.py` | Bedrock の経路が、Azure の経路にある「AI モデルが未登録なら 400」の確認をしていない | 対応済み |
| 2 | 🔵 提案 | `llm_embedding_service.py` | `dimensions` を無視して、1536 次元を返す | 対応済み（1536 以外は 400） |
| 3 | 🔵 提案 | `llm_embedding_service.py` | Bedrock の 429・5xx も 400 で返る | 対応しない |
| 4 | 🔵 提案 | マイグレーション | downgrade で、`BEDROCK_EMBEDDING` の接続先の行が消え、カスケードで結びつきも消える | 対応しない |
| 5 | 🔵 提案 | `llm_embedding_service.py` | docstring の `Raises` が古い | 対応済み |
| 6 | 🔵 提案 | `bedrock_embedding.py` | `bool` が数値として検証を通る | 対応済み |

## 詳細

### 1. AI モデルの未登録の確認（🔴 重要）→ 対応済み

Azure の経路は、`ai_models` に該当がなければ 400 を返し、登録された重みでクレジットを数える。Bedrock の経路は、未登録でも呼び出し、重み 1.0 で記録していた。Azure と同じく、未登録なら呼ぶ前に 400 にし、登録された重みを使う形に直した。そのため、テスト用の `server/seed.sql` に、Titan の行（`BEDROCK_EMBEDDING`・`amazon.titan-embed-text-v1`）を足した。テスト（`test_titan_without_registered_model_returns_400`）を足した。

なお、RAG（メッセージ送信）の経路は、既存の Azure の挙動（モデルが未登録なら重み 1.0）に合わせてあり、変えていない。

### 2. `dimensions`（🔵 提案）→ 対応済み

Titan G1 は 1536 次元だけを返す。`dimensions` に 1536 以外が指定されたら、呼ぶ前に 400 にする。1536 と未指定は受け付ける。テストを 2 件足した。

### 3. 429・5xx が 400（🔵 提案）→ 対応しない

Azure の埋め込みの経路や、RAG の埋め込みの失敗の扱い（400 に変える）と、同じ形に合わせている。上流のエラーのステータスの扱いを変えるのは、Azure も含めた別の変更になる。

### 4. downgrade の削除（🔵 提案）→ 対応しない

`BEDROCK_CHAT` を足した 023 と同じ形（旧 enum に値がない行は表現できないため、先に消す）。downgrade は、開発での取り消し用で、実機（`docs/issue-460/08_動作確認.md`）で動作を確認した。

### 5・6. docstring と `bool`（🔵 提案）→ 対応済み

`Raises` を、Bedrock の経路を含めて直した。`bool` を数値から除き、テスト（`[True] * 1536`）を足した。
