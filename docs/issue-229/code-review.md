# code-review 結果

PR #232 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `frontend/src/store/auth-store.ts` | セッション確認（`GET /api/auth`）のレスポンスにない `tenant_id` で、保存済みのテナントIDを `"undefined"` に上書きする | 対応済み |
| 2 | 🟡 注意 | `frontend/src/store/auth-store.test.ts`, `frontend/src/mocks/handlers/auth.ts`, `frontend/src/types/auth.ts` | モックと型が backend にない `tenant_id` を返す前提になっていて、1 の不具合をテストでも型チェックでも検出できない | 対応済み |
| 3 | 🟡 注意 | `frontend/src/store/auth-store.ts` | パスワードリセット画面の URL を直接開くと（`sessionStorage` が空のとき）テナントIDがなく、リセット API にヘッダが付かない | 対応しない |
| 4 | 🟡 注意 | `frontend/src/routes/auth/login.tsx` | テナントIDを trim しておらず、長さの検証もない。空白だけの入力が必須チェックを通ってしまう | 一部対応（trim） |
| 5 | 🔵 提案 | `frontend/src/store/auth-store.ts` | ログイン失敗時の削除が「frontend-angular と同じ」というコメントと、実際の挙動（理由を問わず削除）が食い違っている | 対応済み |
| 6 | 🟡 注意 | `frontend/src/store/auth-store.ts` | セッション確認が失敗してもテナントIDを残すため、セッションが切れた後も古いテナントIDが残る | 対応しない |
| 7 | 🟡 注意 | `frontend/src/routes/auth/login.test.tsx` | 「テナントIDがないと送信されない」テストを固定 50ms 待ちで確認しており不安定。また `required` 属性で送信が止まっているだけで、JS 側のガードを検証できていない可能性がある | 対応済み |
| 8 | 🔵 提案 | `frontend/src/lib/api-client.ts` | ストレージキーの定数が `TENANT_ID` だけで、他のキー（`AUTH_USER` など）は直書きのまま | 対応しない |

## 詳細

### 1. セッション確認でテナントIDを `"undefined"` に上書きする（🔴 致命的）→ 対応済み

backend の `AuthResponse`（`backend/app/schemas/auth.py`）には `tenant_id` がない。それにもかかわらず `ensureInitialized()` が `persistTenantId(session.tenant_id)` を呼んでいた。ログイン後はダッシュボードへフルページ遷移し、そこで `ensureInitialized()` が走るため、入力したテナントIDが `"undefined"` に置き換わる。その結果、以降のすべてのリクエストが誤ったテナントを送り、403 になる。この処理は develop 時点の `sessionStorage.setItem('TENANT_ID', session.tenant_id)` を引き継いだものだが、テナントIDを入力値から保存する本 PR の方式では致命的になる。

対応: `ensureInitialized()` でテナントIDを保存する処理を削除した。frontend-angular の `initializeSession` もセッション確認の結果からはテナントIDを保存していない。

### 2. モック・型が backend にない `tenant_id` を前提にしている（🟡 注意）→ 対応済み

- `BackendAuthResponse` 型から `tenant_id` を削除し、backend の実際のレスポンスに合わせた（型チェックで誤用を検出できるようにするため）
- MSW の `/api/auth` モックと、`auth-store.test.ts` のセッション確認テストのレスポンスから `tenant_id` を削除した
- セッション確認テストに「`ensureInitialized()` の後も保存済みのテナントIDが変わらないこと」の検証を追加した

### 3. パスワードリセット画面を直接開くとテナントIDがない（🟡 注意）→ 対応しない

ログイン画面からの通常の流れでは、テナントIDはログイン時に保存され、同じタブでのフルページ遷移後も `sessionStorage` に残る（関連テストあり）。URL を直接開いた場合に備える frontend-angular の `?tenantId=` クエリによる代替経路は、ログインキー機能と合わせて `01_要件定義.md` でスコープ外としている。また、本 PR の変更前からある制約である。

### 4. テナントIDの trim・長さ検証（🟡 注意）→ 一部対応（trim）

ログイン画面で `tenantId.trim()` を通してから必須チェックするようにし、trim した値をヘッダに使うようにした。空白だけ・前後に空白がある入力のテストも追加した。3〜50 文字の長さ検証は、ユーザーID側にも React では移植されていないため、`01_要件定義.md` のとおりスコープ外とする（フォームのバリデーションをまとめて移植するときに対応する）。

### 5. ログイン失敗時の削除とコメントの食い違い（🔵 提案）→ 対応済み

挙動は変えず、コメントを実態に合わせた。frontend-angular は 401 のときだけ削除するが、React では次回のログイン送信時に入力値で保存し直されるため、失敗理由を問わず削除してよい、という趣旨にした。

### 6. セッションが切れた後も古いテナントIDが残る（🟡 注意）→ 対応しない

ログイン前に送られるリクエストは、ログイン（送信直前に入力値で上書きする）とパスワードリセット（ログイン時に保存した値を使う必要がある）だけで、古い値が使われる経路はない。セッション確認の失敗時に削除すると、パスワードリセット画面へのフルページ遷移後にリセット API へヘッダが付かなくなる（`02_基本設計.md` に記載）。

### 7. 「送信されない」テストが固定時間待ちで、ガードを検証できていない（🟡 注意）→ 対応済み

`fireEvent.submit` でフォームを直接送信するようにし、`required` 属性による検証を経由せずに `handleSubmit` のガードを確かめる形にした。固定時間の待機はやめた。送信処理に進めばボタンが同期的に disabled になるため、ボタンが disabled になっていないこととハンドラが呼ばれていないことで判定する。未入力と空白のみの 2 パターンにした。ガードを一時的に削除するとこの 2 件が失敗することも確認した。

### 8. ストレージキー定数の一元化（🔵 提案）→ 対応しない

`AUTH_USER` / `PW_RESET_OLD_PASSWORD` などの既存キーの整理は、本 Issue（テナントID入力の移植）の範囲外のリファクタリングになる。また、#223 と同じ `api-client.ts` の変更範囲を広げることになるため見送る。
