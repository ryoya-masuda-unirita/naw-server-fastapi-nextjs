# code-review 結果

対象: PR #201（`/code-review 201` を実行）

correctness 上のバグの指摘はなかった（🔴 0 件）。呼び出し元（frontend-angular の `assistant-list-api.service.ts`）は `search` を送っており、`/admin/assistants` に `q` を送っている箇所は frontend-angular・e2e・frontend のどこにもないことも確認された。

なお、レビュー側は移植元の古いパス（`~/Documents/secuaigent/server`）を参照したため Spring 側を照合できていない。移植元の実装（`~/Documents/unirita-develop-pj/secuaigent/server` の `AssistantController#getAllAssistants` が `@RequestParam(required = false) String search` で受け取り、`AssistantSpecification.containsSearch` で `lower(name)` / `lower(description)` に対して部分一致させる）は実装時に確認済み（`03_詳細設計.md` を参照）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/tests/integration/test_assistants.py` | テスト DB の SQLite は LIKE がもともと ASCII の大文字小文字を区別しないため、`lower()` が外れる回帰を検出できない | 対応しない |
| 2 | 🟡 注意 | `backend/app/routers/assistants.py` | `q` を互換用の別名なしで削除したため、`q` を送るクライアントにはエラーにならず全件が返る | 対応しない |
| 3 | 🔵 提案 | `backend/tests/integration/test_assistants.py` | 検索テストが `status_code == 200` を確認せずに `body["content"]` を参照している | 対応済み |
| 4 | 🔵 提案 | `docs/issue-179/02_基本設計.md` | 過去 Issue の設計ドキュメントに `q` パラメータの記述が残っている | 対応しない |

## 詳細

### 1. SQLite では大文字小文字の区別の回帰を検出できない（🟡 注意）→ 対応しない

指摘のとおり、SQLite の LIKE は ASCII の大文字小文字を区別しないため、このテストだけではリポジトリ層の `func.lower(...)` が外れても検出できない。ただし、検索ロジック（リポジトリ層）は本 PR で変更しておらず、本 PR の目的はパラメータ名の修正である。テストを Postgres で流す、または生成 SQL を検証する仕組みはテスト基盤全体に関わるため、本 PR のスコープ外とする。テストは、API 経由で説明に部分一致させた検索ができることの確認としては有効なので残す。

### 2. 旧パラメータ名 `q` の互換性（🟡 注意）→ 対応しない

移植元 Spring Boot の API には `q` が存在せず、`search` だけを受け取る。移植元の API 仕様に合わせることが本 Issue の方針なので、互換用の別名は設けない。リポジトリ内に `q` で呼び出す箇所はない（レビューでも確認された）。未知のクエリパラメータが無視されるのは、移植元（Spring の `@RequestParam`）と同じ挙動である。なお、指摘中の「全テナントのアシスタントが返る」は誤りで、テナント絞り込み（`X-Tenant-ID`）やグループ管理者の絞り込みは `q` の有無に関係なく効く。

### 3. 検索テストでのステータスコード確認（🔵 提案）→ 対応済み

`test_search_by_name` / `test_search_by_description_case_insensitive` / `test_search_empty_returns_all` / `test_legacy_q_param_is_ignored` の 4 件に、`assert response.status_code == 200` を追加した。再テストの結果:

```text
42 passed in 0.90s
```

全件実行は `15 failed, 767 passed in 38.11s`（失敗 15 件は、修正前の `origin/develop` と同じ、`.env` がないことによる環境依存の失敗）。

### 4. 過去 Issue の設計ドキュメントに残る `q` の記述（🔵 提案）→ 対応しない

`docs/issue-*/` 配下のドキュメントは、各 Issue 対応時点の作業記録であり、最新仕様を表すドキュメントではない。過去の記録を書き換えると当時の経緯がわからなくなるため、修正しない。現在の仕様は本 Issue の `docs/issue-179/` に記録している。
