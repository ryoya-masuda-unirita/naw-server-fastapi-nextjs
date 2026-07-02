# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `frontend/src/store/auth-store.ts:113` | ログイン後 TENANT_ID が空文字のまま書き込まれ、以降の全 API リクエストで X-Tenant-ID ヘッダーが欠落する | 対応済み |
| 2 | 🔴 致命的 | `frontend/src/store/auth-store.ts:104` | 旧パスワードが URL クエリパラメータとして渡され、ブラウザ履歴・サーバーアクセスログ・Referer ヘッダーに平文で残る | 対応済み |
| 3 | 🔴 致命的 | `frontend/src/mocks/handlers/auth.ts:67` | セッション MSW ハンドラーの URL に `/api` が二重に含まれ、api-client のリクエストと一致せずテストでセッション確認が常に失敗する | 対応済み |
| 4 | 🟡 注意 | `frontend/src/hooks/use-auth.ts:1` | ファイル全体が 43 行コメントアウトのデッドコード（CLAUDE.md「不要コードの削除」ルール違反） | 対応済み |
| 5 | 🔵 提案 | `frontend/src/store/auth-store.ts:68` | JSON パースエラーを空の catch で握り潰し（CLAUDE.md「エラー処理は明示的に書く（握り潰し禁止）」ルール違反） | 対応済み |

## 詳細

### 1. ログイン後 TENANT_ID が空文字になる（🔴 致命的）→ 対応済み

**問題**: `login()` 成功時に `sessionStorage.setItem('TENANT_ID', resolveTenantId())` を呼ぶが、ログイン前は TENANT_ID が未設定のため `resolveTenantId()` は `''` を返す。`LoginResponse` に `tenant_id` フィールドがなく取得手段がない。`completePasswordReset` (line 135) も同じ問題を持つ。

**修正**: ログイン後に `ensureInitialized()` を呼び直し、`BackendAuthResponse` の `session.tenant_id` から TENANT_ID を取得・設定するよう変更。

### 2. 旧パスワードが URL に露出（🔴 致命的）→ 対応済み

**問題**: `REQUIRES_PASSWORD_RESET` 時に `window.location.href = '...&oldPassword=...'` でパスワードを URL に含める。ブラウザバック・ログ監視ツール・CDN アクセスログ・サードパーティスクリプトの Referer から読み取られうる。

**修正**: `sessionStorage` に一時保存し、pw-reset 画面で読み取り後に即削除する方式に変更。

### 3. MSW セッションハンドラーの URL が二重 /api（🔴 致命的）→ 対応済み

**問題**: `BASE_URL = 'http://localhost:8000/api'` に対して `${BASE_URL}/api/auth` と書くと `http://localhost:8000/api/api/auth` になる。api-client は `API_PATHS.AUTH.SESSION = '/auth'` を使い `http://localhost:8000/api/auth` を呼ぶため URL が不一致。MSW がインターセプトできず `ensureInitialized()` が常に catch に落ちる。

**修正**: `http.get(\`${BASE_URL}/api/auth\`, ...)` → `http.get(\`${BASE_URL}/auth\`, ...)` に修正。

### 4. use-auth.ts がデッドコード（🟡 注意）→ 対応済み

**問題**: ファイル全体 43 行がコメントアウト。エクスポートが 0。CLAUDE.md「不要コードの削除」ルール違反。「将来的に使う」コメントがあるが、ルールに例外規定はなく Git 履歴で管理すべき。

**修正**: ファイルごと削除。

### 5. JSON パースエラーの握り潰し（🔵 提案）→ 対応済み

**問題**: `catch { // ignore }` で sessionStorage の破損 JSON を無視。原因追跡が困難になり破損データが残り続ける。CLAUDE.md「握り潰し禁止」ルール違反。

**修正**: `console.warn` でログを残し `sessionStorage.removeItem('AUTH_USER')` で破損データをクリアするよう変更。
