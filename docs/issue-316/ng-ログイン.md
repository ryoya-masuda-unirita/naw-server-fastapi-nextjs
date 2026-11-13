# NG: 03_ログイン

見本カテゴリ（23 項目）の実行結果。OK 18・NG 5。NG の 5 件はいずれも **React / backend が移植元と違う本当の差**（テストの誤りではない）。原因は 2 つにまとまる。

| 原因 | 項番 | 修正の対象 |
|---|---|---|
| A. ログイン画面に入力チェック（必須・文字数）がない | 03-03・03-04・03-05・03-17 | `frontend/src/routes/auth/login.tsx` |
| B. ログインキーでの認証に失敗すると、ログイン中のセッションを失い、アラートも出ない | 03-23 | `frontend/src/store/auth-store.ts`・`frontend/src/main.tsx` |

確認の方法: 移植元のコード（`~/Documents/unirita-develop-pj/secuaigent-ref/client`・`server`）と項目書の備考で期待を確かめ、React のコードと、実行時の通信（`POST /auth/login-key` → 401、続く `GET /api/auth` → 400）で原因を特定した。

## 原因 A: 入力チェックがない（03-03・03-04・03-05・03-17）

### [03-03] ユーザーID未入力 / [03-04] パスワード未入力 / [03-05] 両方未入力

- 項目書の期待: 未入力の欄に「この項目は必須です」と表示される
- 移植元の挙動: `client/src/app/features/auth/pages/login/login.component.ts`。`Validators.required` 付きのフォームで、送信時に `markAllAsTouched()` し、欄の下に `VALIDATION.REQUIRED`（「この項目は必須です」）を出す。両方空なら 2 か所に出る
- React の挙動: 画面に文言が出ない（テストで確認）。コードの上では、入力欄の HTML の `required` 属性でブラウザが止めるか、`handleSubmit` が黙って `return` する
- 原因: `frontend/src/routes/auth/login.tsx` に入力チェックの状態とエラー表示がない。`required` 属性に頼っており、`handleSubmit` の冒頭（23 行目付近）は空なら黙って `return` する
- 修正の方針: 移植元と同じく、欄ごとの必須チェックを送信時に行い、`FormInput` の `error` に `VALIDATION.REQUIRED` を渡す。`<form noValidate>` にしてブラウザの標準の吹き出しを出さない

### [03-17] ユーザーID文字数不足

- 項目書の期待: 2 文字のユーザーIDでログインすると、バリデーションエラーが表示される
- 移植元の挙動: `Validators.minLength(3)`・`maxLength(50)`。「3文字以上で入力してください」（`VALIDATION.MIN_LENGTH`）が出て、認証 API は呼ばれない
- React の挙動: 「3文字以上で入力してください」が画面に出ない（テストで確認）。コードの上では文字数のチェックがなく、そのまま認証 API を呼ぶ
- 原因: 原因 A と同じ。ユーザーIDの最小 3・最大 50 文字のチェックがない
- 修正の方針: ユーザーIDに 3〜50 文字のチェックを入れる。あわせて、同じ移植元のフォームにある次のチェックも未移植（この項目書の項番にはないが、同じ修正で揃える）
  - パスワード: 必須、最大 64 文字（`PASSWORD_MAX_LENGTH`）、半角英数字・記号のみ（`passwordAsciiValidator`・入力欄の `asciiOnly`・`maxLength`）。React は `FormInput` にこれらを渡していない

## 原因 B: ログインキーの認証失敗で、ログイン中のセッションを失う（03-23）

### [03-23] ログインキーを使ったログイン（異常系_既存セッションあり）

- 項目書の期待: ログイン中に、不正なログインキーのクエリ付きでアクセスすると、ログイン中のユーザーのままサービスにアクセスでき、アラートが表示される。備考にも「アラートが表示されない」と、1・2 回目の NG の理由が残っている
- 移植元の挙動:
  - `client/src/app/core/initializers/login-key.initializer.ts` は、認証に失敗したら `AUTH.LOGIN_KEY.ERROR`（「不正なログインキーです」）のトーストを出す
  - `AuthStore.loginWithKey` は失敗時にユーザーとストレージ（テナント ID を含む）を消すが、直後のセッション確認（`GET /api/auth`）では `resolveTenantId()` がサブドメインからテナントを補うため、Cookie のセッションからログイン中のユーザーに戻る
- React の挙動（実行時の通信で確認）:
  1. `POST /auth/login-key` → 401（期待どおり）
  2. `loginWithKey` が失敗時に `clearTenantId()` で sessionStorage のテナント ID を消す
  3. 続くセッション確認 `GET /api/auth` が `X-Tenant-ID` なしで送られて **400**
  4. 未ログイン扱いになり `/auth/login` に遷移する。セッション Cookie と backend のセッションは有効なまま
  5. アラートも出ない
- 原因（2 つ）:
  - テナント ID を消す処理（`frontend/src/store/auth-store.ts` の `loginWithKey` の catch、173 行目）。React はサブドメインを使わないため（#193・#195）、移植元のように hostname から補えず、消すとセッション確認が成り立たない。サブドメインの廃止が影響する、移植元からの変更点
  - `frontend/src/main.tsx`（37 行目）が `runLoginKeyInitializer({ loginWithKey })` に `onError` を渡しておらず、失敗時のトーストを出す処理がない（`frontend/src/lib/initializers/login-key.ts` は `onError` を呼ぶ作りになっている）
- 修正の方針:
  - `loginWithKey` の失敗時は、URL の `tenantId` で上書きする前のテナント ID を戻す（なければ消す）。ログインキーの認証に失敗してもログイン中のセッションを壊さない
  - `main.tsx` で `onError` に `AUTH.LOGIN_KEY.ERROR` のトーストを渡す
- 補足: ログインしていない状態での不正なログインキー（03-22）は期待どおりログイン画面になり OK

## 本当の差ではなかったもの（テストの書き直しで解決）

実行中に NG になったが、テストの誤りだったもの。React / backend の差ではない。

- [03-08] ログイン試行回数上限: 5 回で上限になると読んだが、移植元は **6 回目の失敗で 429**（`LoginAttemptService.FAILURE_THRESHOLD = 6`）。backend も同じ挙動なので、テストを 6 回に直した
- [03-20]・[03-21] ログインキーのログイン: ログイン中のユーザーの確認で `GET /api/auth` の `id` を `users.id`（UUID）と比べていたが、`id` はログイン ID。比べる値を直した

## 読み替えたもの（OK にした項目）

- [03-12] テナントURL必須確認: このプロジェクトはサブドメインを使わない（#193・#195）。「テナント付き URL」を「テナント ID の入力」に読み替えた（テナント ID なし・存在しないテナント ID は失敗、正しいテナント ID は成功）
- [03-19] 正常ログイン Chrome: Playwright の Chromium（Chrome と同じエンジン）で確認。Chrome 本体（channel: chrome）では確かめていない
