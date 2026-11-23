# code-review 結果

`/code-review medium`（PR #438）の結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意（important） | `clients/bedrock.py` の `generation_body` | 温度と top_p が両方あると、新しい Claude のモデルが 400 で拒否する | 対応済み |
| 2 | 🔵 提案 | `clients/bedrock.py` の `to_messages_payload` | system の content が配列だと、配列の文字列表現が system になる | 対応しない |
| 3 | 🔵 提案 | `clients/bedrock.py` の `to_messages_payload` | 先頭が assistant の履歴や、空文字のメッセージは 400 になる | 対応しない |
| 4 | 🔵 提案 | `clients/bedrock.py` の `request_target` | キーを 2 つのヘッダーで送っている。実サービスで確かめて 1 つにすべき | 対応しない（未確認事項として記録済み） |

🔴 致命的は 0 件。

## 詳細

### 1. 温度と top_p の同時指定（important）→ 対応済み

OpenAI 系の生成オプションは、温度と top_p が両方入りうる。新しい Claude のモデル（Sonnet 4.5・Haiku 4.5 以降）は、両方を同時に指定すると拒否する、という指摘。私はこの挙動を実機で確かめていないが、送らなくても困ることはなく、失敗した場合の影響（回答が返らない）が大きいため、修正した。

- 両方が指定されたときは、温度だけを送る。top_p だけのときは top_p を送る
- テストを追加した（両方あるとき・top_p だけのとき）。RAG の検証のテストは、温度と最大トークン数を引き継ぐことを確かめる形に直した

### 2. system の content が配列のとき（nit）→ 対応しない

`to_messages_payload` に渡す messages は、`to_provider_messages` の結果で、system の content は常に文字列になる（配列になるのは画像つきの user だけ）。配列の system が渡る経路が現状にない。経路が増えたときに、変換の関数ごと見直す。

### 3. 先頭が assistant・空文字のメッセージ（nit）→ 対応しない

OpenAI 系も同じ入力を、そのまま送っている（履歴の先頭の検査や、空文字の除去はしていない）。Bedrock だけ別の整形をすると、履歴の意味が変わりうる。実際の履歴は、server-local が user の質問を最後に付けて送る形で、先頭が assistant になる想定は見ていない。実機で 400 が出たときに、`08_動作確認.md` の手順で気づける。そのとき対応する。

### 4. キーを 2 つのヘッダーで送っている（nit）→ 対応しない

実機で、Mantle がどちらを要求するかを確かめられないための意図的な設計で、`03_詳細設計.md` に理由を書いてある。`08_動作確認.md` の未確認事項の 1 番目に、確認の手順と、直す場所（`request_target` の 1 関数）を記録した。実機で確認できたら、必要な 1 つだけにする。
