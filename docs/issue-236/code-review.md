# code-review 結果

PR #243 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/room_repository.py` | フィードバックのルーム一覧の評価順に最終キー（ID）がなく、同値の行がページ境界で重複・欠落しうる | 対応しない |
| 2 | 🟡 注意 | `backend/app/repositories/message_feedback_repository.py` | フィードバックのメッセージ一覧の評価順にも最終キーがない | 対応しない |
| 3 | 🔵 提案 | `backend/app/core/sort.py` | 各対応表で `enum_as_string` を付けるのではなく、`build_order_by` で ENUM 列を自動でキャストすれば付け忘れを防げる | 対応しない |
| 4 | 🔵 提案 | `backend/app/repositories/group_assistant_repository.py` | `_TYPE_SORT_COLUMN` が `assistant_repository.py` と重複し、`index_repository.py` とも書き方が違う | 対応しない |
| 5 | 🔵 提案 | `docs/issue-236/05_テスト詳細設計.md` | 単体テストの設計（`Assistant.type`）と実装したテスト（テスト用テーブルの `kind`）が合っていない | 対応済み |

## 詳細

### 1・2. フィードバック一覧の最終キーがない（🟡 注意）→ 対応しない

最終キーがないのは、この PR より前からある挙動で、評価以外の並べ替え（更新日時・アシスタントID など）でも同じ。この PR では並べ替えの列を文字列にするだけで、ページングの安定性は変えていない。移植元（`FeedbackService` の `findAll(spec, pageable)`）も最終キーを足していない。Issue #236 の範囲（ENUM の並び順を移植元に揃える）を超えるため、ここでは直さない。別の Issue で扱うのが妥当。

### 3. `build_order_by` で自動キャストする案（🔵 提案）→ 対応しない

- フィードバックの 2 一覧は `build_order_by` を使っておらず、自動化しても個別対応は残る
- 列の型で暗黙に SQL を変えると、対応表を読んだだけでは文字列順になることが分からない。Issue で求められているのは既存のユーザーの `role` と同じ明示的な書き方で、今回はそれを共通の関数にまとめるところまでとした
- 付け忘れの検出は、SQL を PostgreSQL 方言でコンパイルして確かめるテスト（`test_enum_sort_cast.py`）の書き方を示したことで補う

### 4. `_TYPE_SORT_COLUMN` の重複（🔵 提案）→ 対応しない

中身は `enum_as_string(Assistant.type)` の 1 行だけで、別のリポジトリの非公開の定数を import し合う方が依存が分かりにくくなる。アシスタントの 2 ファイルは種別の別名キーが 3〜4 個あるので定数にし、インデックスはキーが 1 つなのでインラインにしている。

### 5. テスト詳細設計とテストの不一致（🔵 提案）→ 対応済み

`05_テスト詳細設計.md` を実装に合わせ、テスト用テーブル `items` の ENUM 列 `kind` を使うこと、`test_order_by_uses_casted_column` を追加したことを書いた。
