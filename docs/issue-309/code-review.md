# code-review 結果

`code-review` スキル（`high`）の結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/alembic/versions/024_replace_login_key_with_hash.py` | develop に `issue307`（down_revision `023`）が入っており、`down_revision = "023"` のままだとマージで head が 2 つになる | 対応済み |
| 2 | 🟡 注意 | `backend/.claude/CLAUDE.md` | docstring を Google 形式と書いているのに、触ったファイルを NumPy 形式にしたため規約が割れる | 対応済み |
| 3 | 🟡 注意 | `backend/alembic/versions/024_replace_login_key_with_hash.py` | 既存の平文キーを捨てるため、配布済みのログインキーのリンクが移行後すぐに 401 になる | 対応しない |
| 4 | 🔵 提案 | `backend/app/schemas/user.py` | `_UserMutationResponse` が `UserResponse` の項目を再宣言している | 対応しない |
| 5 | 🔵 提案 | `backend/app/routers/auth.py` | GET `/api/auth` で所属グループの問い合わせが 1 回増える | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/message_service.py` | GET `/api/messages` で `assistants_endpoints` への問い合わせが 1 回増える | 対応しない |
| 7 | 🔵 提案 | `docs/issue-309-loginkey/` | 同じ Issue の docs が 2 つのディレクトリにある | 対応しない |
| 8 | 🔵 提案 | `backend/app/services/user_import_service.py` | `createLoginKey` の列名を大文字小文字・空白まで見ない | 対応しない |
| 9 | 🔵 提案 | `backend/app/schemas/file.py` | `PlainSerializer` が `model_dump()` にも効く | 対応済み |

## 詳細

### 1. マイグレーションの head が 2 つになる（🔴 致命的）→ 対応済み

レビュー時点で #307 が develop にマージされ、`issue307_split_library_contents.py`（revision `issue307`、down_revision `023`）が入っていた。最新の develop を取り込み、`down_revision` を `issue307` に付け替えた。`uv run alembic heads` が `issue309 (head)` の 1 つだけになることを確かめ、全件テストも通した。

### 2. docstring 規約の食い違い（🟡 注意）→ 対応済み

ユーザー指示（2026-11-13）で NumPy 形式にしたため、`backend/.claude/CLAUDE.md` の「docstring」の節を NumPy 形式（例・ruff での確認コマンド付き）に書き換えた。

### 3. 既存キーの破棄（🟡 注意）→ 対応しない

移植元 changeset-009（Q-03）の決定と同じ。平文を変換して残すと、一度でも漏れたキーが使い続けられてしまう。PR 本文と `03_詳細設計.md` に「再発行が必要」と明記した。

### 4〜6. 重複・追加クエリ（🔵 提案）→ 対応しない

- `_UserMutationResponse`: 移植元の作成・更新の応答は `UserResponse` と別の型で、`totalCredits` を持たない。継承すると `totalCredits` が混ざるため、別の型のままにした。項目が増えたときは移植元の Response に合わせて足す
- 追加クエリ: どちらも 1 クエリを足すだけ（N+1 ではない）。`GET /api/messages` の `model` は、既存の `find_tenant_endpoints_grouped_by_assistant_id` の結合に混ぜると、他の呼び出し元の戻り値の型が変わるため分けた。問題になれば統合する

### 7. docs が 2 つ（🔵 提案）→ 対応しない

1 本目の PR（#317）が先に `docs/issue-309-loginkey/` を作っており、2 本目が同じディレクトリを足すとマージ時に衝突するため分けた（`00_チケット内容.md` に理由を書いた）。

### 8. 列名の判定（🔵 提案）→ 対応しない

移植元 `CsvUserImportValidator` も `createLoginKey` を完全一致で判定する。

### 9. `PlainSerializer`（🔵 提案）→ 対応済み

`when_used="json"` を付け、`model_dump()`（Python モード）は列挙のままにした。HTTP 応答（JSON）だけが列挙名になる。
