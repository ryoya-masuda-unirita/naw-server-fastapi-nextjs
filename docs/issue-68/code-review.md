# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/models/user.py` | `login_key` に `(tenant_id, login_key)` のユニーク制約が存在せず、重複した場合に `find_by_login_key` が非決定的にユーザーを返す可能性がある | 対応しない（別Issueで対応） |
| 2 | 🔵 提案 | `backend/app/schemas/auth.py` | `LoginKeyRequest.loginKey` に空文字を拒否するバリデーションがない | 対応しない |

## 詳細

### 1. `login_key` にユニーク制約がない（🟡 注意）→ 対応しない

移植元Spring Boot側では、`changeset-008-add-unique-tenant-id-login-key.xml` により `users` テーブルの `(tenant_id, login_key)` に一意制約 `uq_users_tenant_id_login_key` が追加されている。

一方、FastAPI側の `backend/app/models/user.py` の `User` モデル、および `alembic/versions/001_init_tenants_users.py` にはこの一意制約が存在しない。もし同一テナント内で同じ `login_key` を持つユーザーが複数存在した場合、本Issueで実装した `UserRepository.find_by_login_key` は `.scalars().first()` で先頭の1件を返すため、どのユーザーとして認証されるかが非決定的になる（DBが返す行順に依存する）。

この `login_key` カラム自体は本Issueより前の別Issueでユーザー作成・更新機能の一部として移植済みのものであり、本Issueはあくまで認証APIの追加が対象。また、調査の過程で `alembic/versions/` に `015_add_libraries.py` と `015_add_token_usages.py` という同一リビジョン番号を持つ2つのマイグレーションが既に存在し、`alembic heads` が2つのheadを返す状態（`develop` に既に存在する、本PRとは無関係の問題）であることを確認した。この状態でユニーク制約追加のマイグレーションを新設すると、head解消のためのマージマイグレーションも合わせて必要になり、本Issueのスコープ（認証APIの移植）を超える。

**対応方針**: 本PRでは修正せず、`(tenant_id, login_key)` への一意制約追加を目的とした別Issueを起票して対応する（現状は `login_key` を発行・更新するAPI自体が未実装のため、重複が生じる経路は現時点で存在せず、実害はまだない）。

### 2. `LoginKeyRequest` に空文字バリデーションがない（🔵 提案）→ 対応しない

`loginKey` に空文字 `""` が送られた場合、バリデーションエラーにはならず、そのままDBクエリに渡る（該当ユーザーがいなければ401になるだけで実害はない）。既存の `LoginRequest`（`username`/`password`）も同様に長さバリデーションを行っていないため、本PRのみ挙動を変えるとAPI間で一貫性がなくなる。将来的にバリデーションを追加する場合は `LoginRequest` も含めて統一的に対応すべきと考え、本PRでは対応しない。
