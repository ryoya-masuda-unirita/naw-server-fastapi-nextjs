# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/routers/users.py`, `backend/app/core/security.py` | テナント分離バイパス（X-Tenant-ID ヘッダーと JWT の tenant_id 不一致チェックなし） | 対応済み |
| 2 | 🔴 致命的 | `backend/app/services/user_service.py` | `update_profile` がパスワード強度・履歴チェックを呼んでいない | 対応済み |
| 3 | 🔴 致命的 | `backend/app/schemas/user.py`, `backend/app/services/user_service.py` | `UserResponse.id`（UUID）と PATCH/DELETE の `{user_id}`（実は login_id）の不一致 | 対応しない |
| 4 | 🟡 注意 | `backend/app/services/auth_service.py` | リファクタで `login()` のエラーコードが履歴0件時 403→401 に変化 | 対応しない（リファクタIssueへ） |
| 5 | 🟡 注意 | `backend/app/services/user_service.py` | `search_text` の LIKE ワイルドカード（`%`, `_`）エスケープ漏れ | 対応しない（リファクタIssueへ） |
| 6 | 🟡 注意 | `backend/app/services/user_service.py` | `sort` パラメータの列名にホワイトリストがない | 対応しない（リファクタIssueへ） |
| 7 | 🟡 注意 | `backend/tests/unit/test_auth_service.py` | リファクタ前にあったテストケース（履歴0件エラー、save呼び出し確認）相当が欠落 | 対応しない（リファクタIssueへ） |
| 8 | 🔵 提案 | `backend/app/services/user_service.py` | `delete_user` の冪等設計の意図確認 | 対応しない（リファクタIssueへ） |
| 9 | 🔵 提案 | `backend/app/schemas/user.py`, `backend/app/core/security.py` | CLAUDE.md 型ヒント漏れ（`from_user`, `require_admin`） | `require_admin` のみ対応済み（致命的指摘の修正過程で解消）、`from_user` は未対応 |
| 10 | 🔵 提案 | `backend/app/services/user_service.py` | `_get_user`/`_get_tenant` パターンが複数ファイルに重複 | 対応しない（リファクタIssueへ） |
| 11 | 🔵 提案 | `backend/app/services/user_service.py` | `create_user`/`update_user` のパスワード生成ロジック重複 | 対応しない（リファクタIssueへ） |
| 12 | 🔵 提案 | `backend/app/services/user_service.py` | `get_users` の count/本体クエリ直列実行、Tenant 重複フェッチ、bcrypt検証のブロッキング等の効率性指摘 | 対応しない（リファクタIssueへ） |
| 13 | 🔵 提案 | `backend/app/services/user_service.py` | `excludeGroupId` パラメータを受理しつつ無視している | 対応しない（リファクタIssueへ） |

## 詳細

### 1. テナント分離バイパス（🔴 致命的）→ 対応済み

`X-Tenant-ID` ヘッダーをそのまま `tenant_id` としてクエリ条件に使っており、JWT 内の `tenant_id` との一致チェックがなかった。ADMINロールユーザーが自分のJWT（tenant_id=A）のまま `X-Tenant-ID: B` を送ると、他テナントのユーザーCRUD・プロフィール操作が可能になっていた。

Spring Boot 元実装は PostgreSQL の RLS が JWT 由来の tenant_id のみを信頼するフェイルセーフ層として機能していたが、FastAPI 版にはこの防御層がなかった。

**修正**: `backend/app/core/security.py` に `get_verified_tenant_id` を追加し、ヘッダーと JWT の tenant_id が一致しない場合 403 を返すように変更。`backend/app/routers/users.py` の全エンドポイントで `Header(...)` の代わりにこの Depends を使うよう変更。テストケース `test_tenant_header_mismatch_gets_403` を追加して検証。

### 2. update_profile のパスワードポリシー未適用（🔴 致命的）→ 対応済み

`update_profile`（自分のパスワード変更）は `PasswordHistoryRepository.save` を直接呼ぶだけで、`reset_password` が行うパスワード強度チェック・過去パスワード重複チェックを行っていなかった。

**修正**: パスワード強度検証・履歴重複チェックのロジックを `backend/app/core/password_policy.py` に共通化（`verify_password_strength`, `check_password_not_reused`）し、`auth_service.py`（reset_password）と `user_service.py`（update_profile）の両方から呼び出すよう変更。CLAUDE.md の「service同士の呼び出し禁止」ルールに従い、共通ロジックは `core/` に配置した。テストケースを追加して検証。

### 3. UserResponse.id と {user_id} の不一致（🔴 致命的）→ 対応しない

調査の結果、Spring Boot 元実装（`UserController.java`）もパスパラメータ `userId` に実際は `login_id` を渡す設計であり、フロントエンド（`secuaigent-client/.../user-list-api.service.ts`）も明示的に `loginId` を使って PATCH/DELETE の URL を組み立てていることを確認した。`UserResponse.id`（UUID）とは独立した設計で、バグではなく意図的な仕様。

### 4〜13（🟡 注意・🔵 提案）→ 対応しない（リファクタIssueへ）

致命的指摘の修正を優先し、本Issueでは対応しない。本Issueの実装完了後、別途リファクタリングIssueを発行して対応する。

なお、9番（CLAUDE.md型ヒント漏れ）のうち `require_admin`・`get_current_user` は致命的指摘1・2番の修正過程で型ヒントを付与したため結果的に解消した。`schemas/user.py` の `from_user` の型ヒント漏れは未対応のままリファクタIssueに引き継ぐ。
