# code-review 結果

`/code-review`（max effort、10角度並列探索 + 1件ずつ検証 + スイープ）を実行。多くの指摘をcurl・Playwright・git diff実験による直接検証で確認した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/main.py` | CORS `allow_headers` に `X-Tenant-ID` が含まれておらず、テナントID判明後の全リクエストがプリフライトで拒否される | 対応済み |
| 2 | 🔴 致命的 | `backend/app/main.py` | `get_settings()` をモジュールレベルで呼ぶことで、`.env` が無い環境で `import app.main` 自体が失敗する新規回帰 | 対応済み |
| 3 | 🔴 致命的 | `frontend/src/lib/constants/api-paths.ts` | SESSIONは直したがLOGIN/LOGOUT/PASSWORD_RESETが同種のバグ（逆方向）で404のまま | 対応済み |
| 4 | 🟡 注意 | `backend/app/core/config.py` | `CORS_ALLOWED_ORIGIN_REGEX` が `None` ではなく空文字列 `''` になる | 対応済み |
| 5 | 🟡 注意 | `backend/app/core/config.py` | CORS未設定時のfail-fastバリデーションが無い（Spring版は起動時エラー） | 対応しない |
| 6 | 🟡 注意 | `backend/tests/unit/test_cors.py` | 実アプリ（`app.main.app`）ではなくスタンドアロンアプリを検証しており、指摘1を検出できない | 対応済み |
| 7 | 🔵 提案 | `backend/app/core/config.py` | pydantic-settingsのネイティブ機能を使わず手動でカンマ区切りをパースしている | 対応済み |
| 8 | 🔵 提案 | `backend/app/main.py` | `allow_methods`/`allow_headers` のハードコードがSpring版の`"*"`から乖離しており将来の保守罠になる | 対応済み |
| 9 | 🔵 提案 | `backend/tests/unit/test_config.py` | ヘルパー関数のdocstringにArgs/Returnsが無い（backend CLAUDE.md違反） | 対応済み |
| 10 | 🔵 提案 | `docs/issue-18/02_基本設計.md` | 設計ドキュメントと実装が乖離している | 対応済み |

## 詳細

### 1. X-Tenant-IDヘッダー欠落（🔴 致命的）→ 対応済み

`backend/app/main.py` の `allow_methods`/`allow_headers` を個別列挙のハードコードから `["*"]` に変更（指摘8とあわせて対応）。移植元Spring Bootの `addAllowedMethod("*")`/`addAllowedHeader("*")` と同じ方針にし、将来のヘッダー追加でも同じ問題が再発しないようにした。

curlで実機再検証：`Access-Control-Request-Headers: content-type,x-tenant-id` を含むプリフライトが `200 OK` に変化したことを確認。

### 2. `main.py`でのSettings構築による回帰（🔴 致命的）→ 対応済み

`Settings`（`database_url`・`secret_key` が必須）とは別に `CorsSettings` クラスを新設し、`main.py` はCORS設定のみが必要な `CorsSettings` を使うようにした。これにより `.env` が存在しない環境（新規clone・CI）でも `import app.main` が失敗しなくなる。

git diff実験で確認：developブランチのmain.pyは`.env`無しでimport成功、修正前のPRコードは失敗、修正後のコードは成功することを確認。回帰テスト（`test_app_main_importable_without_env_file`）も追加した。

### 3. LOGIN/LOGOUT/PASSWORD_RESETのパス不整合（🔴 致命的）→ 対応済み

根本原因（`api-client.ts` が全パスに自動的に `/api` を付与する設計）を修正。`API_BASE_URL` から `/api` の自動付与をやめ、各エンドポイントのパス定数に実際のバックエンドルーティングと一致する値（`SESSION` のみ `/api/auth`、他は `/auth/*`）を明示的に持たせる形にした。

あわせて `frontend/src/mocks/handlers/auth.ts` のMSWモックが誤ったポート（8001、実際は8000）と誤ったパス前提だったため修正し、フロントエンドテスト（`npx vitest run`、45件）が通ることを確認した。

Playwrightで実機再検証：`POST /auth/login` が404から200に変化したことを確認（後述の新規判明バグにより、ログイン自体はまだ完了しない）。

### 4. `CORS_ALLOWED_ORIGIN_REGEX`の空文字列問題（🟡 注意）→ 対応済み

`field_validator(mode="before")` で空文字列を `None` に正規化するようにした。テストケース `test_returns_none_when_empty_string` を追加。

### 5. CORS未設定時のfail-fastバリデーション（🟡 注意）→ 対応しない

Spring Boot版は起動時に例外を投げるが、これを追加すると指摘2の回帰と同じ理由（`.env`が無い環境で `import app.main` が失敗する）が再発する。また、CORS未設定時の実際の挙動（許可オリジンなし＝全リクエスト拒否）はfail-closed（安全側）であり、セキュリティ上の実害はない。運用上の検知はドキュメント（`.env.example`）に委ね、コード側の強制バリデーションは追加しないこととした。

### 6. `test_cors.py`が実アプリを検証していない（🟡 注意）→ 対応済み

`from app.main import app` で実アプリをインポートして検証するように書き換え、`X-Tenant-ID` を含むプリフライトのテストケースを追加した（指摘1の回帰防止）。

### 7. pydantic-settingsのネイティブ機能不使用（🔵 提案）→ 対応済み

`cors_allowed_origins_raw: str` + `@property` の二段構えをやめ、`Annotated[list[str], NoDecode]` + `@field_validator(mode="before")` を使った単一の `cors_allowed_origins: list[str]` フィールドに統合した。

### 8. `allow_methods`/`allow_headers`のハードコード（🔵 提案）→ 対応済み

指摘1と合わせて `["*"]` に変更済み。

### 9. ヘルパー関数のdocstring不備（🔵 提案）→ 対応済み

`_build_cors_settings`・`_preflight` にArgs/Returnsセクションを追加した。

### 10. 設計ドキュメントと実装の乖離（🔵 提案）→ 対応済み

`03_詳細設計.md` を最終実装（`CorsSettings`分離、`NoDecode`、`allow_methods/headers=["*"]`）に合わせて更新した。

---

## 動作確認中に新たに判明した問題（本Issueのスコープ外）

上記対応後、Reactフロントエンドで実ログインを再検証したところ、`POST /auth/login` が404から422（Unprocessable Content）に変化した。原因は、Reactの `resolveTenantId()`（`frontend/src/lib/api-client.ts`）が `sessionStorage` のみを参照し、Angular版（`frontend-angular`）のようなサブドメインからのテナントID解決手段を持たないため、初回ログイン時に `X-Tenant-ID` ヘッダーを一切送信できないこと。バックエンドはこのヘッダーを必須としており、ログインが成立しない。

この問題は今回のcode-reviewの10件の指摘には含まれておらず、CORS・パス不整合とは別種の新規バグである。現在の開発方針（`frontend/` は当面不問）に基づき、Issue化はせずここに記録のみ残す。
