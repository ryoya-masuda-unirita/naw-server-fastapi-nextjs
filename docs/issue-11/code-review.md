# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/auth_service.py:99` | `reset_password` が `expired_at` を設定せず、ユーザー自身によるパスワードリセット後にパスワード有効期限が設定されない | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/user_service.py:95` | `sort_dir` が大文字・空白バリアント（"DESC", " desc"）でサイレントに `asc` にフォールバックする | 対応しない |
| 3 | 🔵 提案 | `backend/app/services/auth_service.py:17` | `login()` の docstring に Args/Returns/Raises がない（CLAUDE.md 規約違反） | 対応済み |
| 4 | 🔵 提案 | `backend/app/services/auth_service.py:54` | `reset_password()` の docstring に Args/Returns/Raises がない（CLAUDE.md 規約違反） | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/user_service.py:92` | `sort.split(",")` は常に非空リストを返すため `else "created_at"` は dead code | 対応済み |
| 6 | 🔵 提案 | `backend/app/services/user_service.py:35` | `_SORTABLE_COLUMNS` に camelCase と snake_case の両エントリを持つため、新規列追加時に2箇所の更新が必要 | 対応しない |

---

## 詳細

### 1. `reset_password` が `expired_at` を設定しない（🔴 致命的）→ 対応済み

**問題**:
`auth_service.reset_password`（ポート元: `/auth/password/reset` エンドポイント）が `PasswordHistoryRepository.save` を呼ぶ際に `expired_at` を渡していなかった（`None` 扱い）。

**Spring Boot 照合結果**:
`PasswordResetService.java:125-131` では明示的に `expiredAt` を設定している:
```java
Instant expiredAt = Instant.now().plus(tenant.getPwValidityPeriodDays(), ChronoUnit.DAYS);
passwordHistoryRepository.save(PasswordHistory.builder()
        ...
        .expiredAt(expiredAt)
        .build());
```

**影響**:
ユーザーが初回ログイン時に自分でパスワードを変更した場合、そのパスワードに有効期限が設定されない。管理者によるパスワードリセット（`create_user` / `update_user` → `_issue_initial_password`）では `expired_at` が設定されており非対称だった。

**修正内容**:
`auth_service.reset_password` に `from datetime import datetime, timedelta, timezone` を追加し、`save` 前に有効期限を計算して渡すよう修正した:
```python
expired_at = datetime.now(timezone.utc) + timedelta(days=tenant.pw_validity_period_days)
await PasswordHistoryRepository.save(user.id, tenant_id, hash_password(new_password), session, expired_at=expired_at)
```
また `test_reset_password_calls_save` に `kwargs.get("expired_at") is not None` のアサーションを追加した。

---

### 2. `sort_dir` の大文字・空白バリアント（🟡 注意）→ 対応しない

`sort_dir == "desc"` は大文字の "DESC" や先頭空白付き " desc" に一致しない。不一致の場合は暗黙的に `asc` になる。

**対応しない理由**:
フロントエンド（Angular/React）が送信する `sort` パラメータは常に小文字の `"asc"` / `"desc"` であることが実装上確認されている。バリデーションを追加するとルーターのレイヤー責務が変わるため、issue-11 のスコープでは対応しない。将来 `Literal["asc", "desc"]` 型でルーターのクエリパラメータを定義する際に同時対応が望ましい。

---

### 3・4. `auth_service` の docstring 不足（🔵 提案）→ 対応済み

CLAUDE.md の規約「引数・戻り値・例外がある関数には必ず記載すること（Google スタイル）」に違反していた。`login` および `reset_password` に Args/Returns/Raises セクションを追記した。

---

### 5. Dead code in sort parsing（🔵 提案）→ 対応済み

`sort.split(",")` は空文字列でも `[""]` を返すため `else "created_at"` は実行されない。以下を修正:
```python
# Before
sort_col_name = sort_parts[0] if sort_parts else "created_at"
# After
sort_col_name = sort_parts[0]
```

---

### 6. `_SORTABLE_COLUMNS` の二重管理（🔵 提案）→ 対応しない

camelCase / snake_case で同一列を2エントリ持つ設計のため、新しいソート列を追加する際に両方の登録が必要。登録漏れが起きると片方のエイリアスだけが機能しない。

**対応しない理由**:
現状の列数（4列 × 2形式 = 8エントリ）では管理コストは許容範囲内。正規化関数を導入すると `_SORTABLE_COLUMNS` の定義と `_resolve_sort_column` の両方を変更する必要があり、かえって複雑になるため、今後ソート対象列が増えた際に再検討する。

---

## 補足: issue-9 から持ち越した調査結果の確認

issue-9 の code-review で対応を保留した以下の指摘について、本 issue で Spring Boot の実装を照合した。

### 認証エラーコード差異（issue-9 保留 #4）

| エンドポイント | FastAPI | Spring Boot |
|---|---|---|
| `POST /auth/login` | 401 | 401 |
| `POST /auth/password/reset` | 403 | 403 |

一致しており、ポート元の意図どおりの実装であることを確認した。

### 削除の冪等設計（issue-9 保留 #8）

Spring Boot の JPA 由来 `deleteByLoginIdAndTenantId` は対象が0件でもエラーを投げない。FastAPI の実装は `find_by_login_id` で対象を取得し、`None` の場合は何もしないため、同等の冪等性が確保されている。
