# code-review 結果

`/code-review medium` の結果。各指摘を実際のコードで確かめた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 重要 | `file_service.py` | 差し替えで、古いファイルを先に消してから、新しい登録が失敗すると、両方を失う | 対応済み |
| 2 | 🔴 重要 | `file_vectorization.py` | `add_rows` の想定外の失敗（次元数の不一致など）が、400 にならず 500 になりうる | 対応済み |
| 3 | 🔴 重要 | `file_service.py` | 削除でベクトルを先に消すため、あとの失敗で、検索できないのにファイルが残る | 対応済み |
| 4 | 🔴 重要 | `file_vectorization.py` | 巨大なファイルで、埋め込みの回数が無制限 | 対応済み（一部） |
| 5 | 🔵 提案 | `file_vectorization.py` | 空白だけの部分が埋め込まれる | 対応済み |
| 6 | 🔵 提案 | `file_vectorization.py` | 分割で、「。」の分だけ分割長を超えうる | 対応しない |
| 7 | 🔵 提案 | `file_vectorization.py` | `assert` を実行時の確認に使っている | 対応済み |

## 詳細

### 1. 差し替えの順序（🔴 重要）→ 対応済み

移植元は「古いファイルを削除してから、新規作成」だが、新規作成（取り出し・埋め込み・保存）が失敗すると、古いファイルも検索のデータも失う。ベクトル化を足したことで、この失敗の窓が新しくできる。**新しいファイルを先に登録し、成功してから、古いファイルを削除する**順に変えた。登録が失敗しても、古いファイル・ストレージ・ベクトルが残る（テスト `test_failed_replace_keeps_old_file_and_vectors`）。削除が失敗した場合は、新旧のファイルが並ぶが、データは失われない。

### 2. `add_rows` の失敗（🔴 重要）→ 対応済み

`HTTPException` はそのまま、それ以外（`ValueError`＝次元数の不一致など）は、ログに残して 400（`Failed to store vectors for file`）にする。ストレージ・記録・ベクトルの後始末は、既存の流れで行われる（テスト `test_unexpected_store_error_returns_400_and_rolls_back`）。

### 3. 削除の順序（🔴 重要）→ 対応済み

ベクトルを**最後**に削除する。失敗しても、ファイルは削除済みなので、失敗を記録して続ける。ファイルのないベクトルは、RAG の検索（`find_not_deleted_by_ids_and_tenant_id`）で読み飛ばされるため、検索には出ない。表がない場合は、`delete_by_file_id` が 0 件として扱う（#461）。テスト `test_delete_succeeds_even_when_vector_deletion_fails`。

### 4. 巨大なファイル（🔴 重要）→ 一部対応

1 ファイルの分割数に上限（2000）を設け、超えるときは、埋め込みの前に、400 にする（テスト `test_too_many_chunks_returns_400_before_embedding`）。並列化・バッチ化と、失敗時に消費済みのトークンを記録することは、見送る。Bedrock の埋め込みは、回数制限があり、並列にすると 429 に当たりやすい。途中で失敗した分のトークンは、請求の側では数えられるが、`TokenUsage` には残らない（`08_動作確認.md` の未確認事項に書いた）。

### 5. 空白だけの文章（🔵 提案）→ 対応済み

分割の前に、空白だけの文章を除く。移植元の分割は、空白だけの文章から「。」だけの部分を作ってしまうため、分割の後の確認では足りなかった（テスト `test_whitespace_only_content_is_not_embedded`）。

### 6. 分割長（🔵 提案）→ 対応しない

移植元の `ContentSplitter` と同じ動き（現在の部分の長さを、文の長さだけで比べ、あとから「。」を付ける）。厳密にすると、移植元と部分の区切りが変わる。テスト `test_part_may_exceed_limit_by_the_appended_period` で、動きを明記した。

### 7. `assert`（🔵 提案）→ 対応済み

`VectorTarget.embedding` を、`None` を許さない型にした（`resolve_target` が、なければ `None` を返す）。実行時の `assert` を除いた。
