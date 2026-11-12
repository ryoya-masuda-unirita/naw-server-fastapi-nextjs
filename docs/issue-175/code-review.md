# code-review 結果

`/code-review medium 204` の結果をまとめる。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/file_repository.py` | `status`・`userId` は値の重複が多く、第 2 キーがないとページ間で行が重複・欠落しうる | 対応済み |
| 2 | 🟡 注意 | `backend/app/repositories/file_repository.py` | 「更新者順」が UUID 順でありユーザー名順にならない | 対応しない |
| 3 | 🔵 提案 | `backend/app/repositories/file_repository.py` | 並べ替え方向が大文字小文字を区別し、`DESC` が昇順になる | 対応済み |
| 4 | 🟡 注意 | `backend/app/repositories/file_repository.py` | 未知の並べ替えキーが黙って `updatedAt` にフォールバックする | 対応しない |
| 5 | 🔵 提案 | `backend/tests/integration/test_files.py` | テストが SQLite のみで、PostgreSQL の UUID 比較順やページング安定性を検証できない | 対応しない |
| 6 | 🔵 提案 | `backend/tests/integration/test_files.py` | `DELETED` の並び位置を検証していない | 対応しない |

## 詳細

### 1. 同順位の並びが不定（🟡 注意）→ 対応済み

`order_by` の第 2 キーに `File.id.asc()` を追加し、同じ `status`・`userId` の行の順序を確定させた。移植元の `Pageable` は第 2 キーを付けないが、API の入出力仕様は変わらず、ページングの重複・欠落を防げるため対応した。

### 2. 「更新者順」がユーザー名順にならない（🟡 注意）→ 対応しない

移植元（Spring Boot）は `Pageable` の `userId` を `files.user_id` 列で並べ替えており、ユーザー名との結合は行っていない。本対応は「backend を移植元の API 仕様に合わせる」方針のため、移植元と同じ挙動とした。ユーザー名順にするかは移植元を含めた仕様判断が必要なため、`01_要件定義.md` のスコープ外に明記した。

### 3. 並べ替え方向の大文字小文字（🔵 提案）→ 対応済み

移植元 `Direction.fromString` は大文字小文字を区別しないため、`sort_dir.lower() == "desc"` で比較するよう修正した。`test_sort_by_status` の降順ケースを `status,DESC` に変更して検証している。

### 4. 未知キーのフォールバック（🟡 注意）→ 対応しない

既存の挙動であり、本 Issue のスコープ（`userId`・`status` 対応）外。エラーに変えると、現行の画面が送る可能性のある他のキーで一覧が表示できなくなるリスクがあるため、別途判断とする。

### 5. SQLite のみでの検証（🔵 提案）→ 対応しない

共有のローカル Postgres を使わない作業ルールのため、インメモリ SQLite の自動テストで代替している。`08_動作確認.md` の未確認事項に記載済み。

### 6. `DELETED` の並び位置（🔵 提案）→ 対応しない

`DELETED` は保存値 2（`ENABLE=0, DISABLE=1` の後）で、並べ替えは列値そのものを使うため順序は保存値で決まる。また論理削除済みファイルは通常の一覧から除外される想定（#178）であり、検証の優先度は低いと判断した。
