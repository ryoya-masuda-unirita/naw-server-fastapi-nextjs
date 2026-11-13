# NG: 05_パスワード再設定

05_パスワード再設定（38 項目）の実行結果。OK 28・NG 10。NG の 10 件は、いずれも **React が移植元と違う本当の差**（テストの誤りではない）。backend は移植元と同じ挙動で、直す場所はすべて `frontend/`。原因は 3 つにまとまる。

| 原因 | 項番 | 修正の対象 |
|---|---|---|
| A. 必須チェックがブラウザ標準の吹き出し（HTML の `required`）で、画面の文言「この項目は必須です」が出ない | 05-05・05-06・05-07・05-08・05-09 | `frontend/src/routes/auth/pw-reset.tsx` |
| B. 失敗時に backend のメッセージではなく「HTTP 403」「HTTP 400」と出る | 05-17・05-19・05-20 | `frontend/src/routes/auth/pw-reset.tsx` |
| C. 更新成功の「パスワードを更新しました。」が出ない | 05-03・05-04 | `frontend/src/routes/auth/pw-reset.tsx`・`frontend/src/store/auth-store.ts` |

確認の方法: 移植元のコード（`~/Documents/unirita-develop-pj/secuaigent-ref/client/src/app/features/auth/pages/pw-reset/pw-reset.component.ts`・`.html`）と項目書の備考で期待を確かめ、React のコードと、実行時の画面（失敗時のスクリーンショット）・通信（`POST /auth/password/reset` の応答）で原因を特定した。

## 原因 A: 必須チェックの文言が出ない（05-05〜05-09）

### [05-05] ログインID未入力 / [05-06] 旧パスワード未入力 / [05-07] 新パスワード未入力 / [05-08] 再入力未入力 / [05-09] 全項目未入力

- 項目書の期待: 未入力の欄に「この項目は必須です」と表示される。05-08 は備考のとおり、再入力が空で新パスワードだけ入力されているときは「パスワードが一致しません」が出る
- 移植元の挙動: `pw-reset.component.ts`。フォームは `Validators.required`（新パスワード・再入力は `passwordFieldValidators()`）で、送信時に `form.markAllAsTouched()` して `resolveControlError` が `VALIDATION.REQUIRED`（「この項目は必須です」）を欄の下に出す。新パスワードと再入力で値が違えば（両方空でなければ）`pwResetPasswordMatchValidator` が再入力に `passwordMismatch` を付け、再入力欄は必須より不一致を優先して出す（05-08 の備考と一致）
- React の挙動: 空のまま「パスワードを更新」を押すと、ブラウザ標準の吹き出し「Please fill out this field.」（ブラウザの言語の文言）が出て、画面の文言は出ない。05-08 では不一致の判定まで進まない（送信がブラウザに止められる）
- 原因: `frontend/src/routes/auth/pw-reset.tsx` の 4 つの `FormInput` に `required`（88・100・112・124 行目）が付いていて、`FormInput`（`frontend/src/components/shared/form-input.tsx` 153 行目）が `<input required>` にそのまま渡している。React 側は送信時の自前の入力チェックを持たない
- 修正の方針: `required` を渡すのをやめ、送信時に空の欄へ `VALIDATION.REQUIRED` を `error` で出す（移植元と同じく、新パスワードと再入力の不一致は再入力欄に出し、不一致を必須より優先する）。移植元の最大長 64・ASCII のチェック（`PASSWORD_MAX_LENGTH`・`passwordAsciiValidator`）も合わせて確認する
- 補足: 移植元のログインID欄は編集できない（`disabled`）。React では編集できる。05-05 は「画面を直接開いた（ログインIDが空の）状態で他を入力して更新」で確かめている。移植元ではこの欄は無効で必須エラーが出ないため、05-05 の期待そのものが現行の移植元と合っていない可能性がある（項目書の期待を正として NG にした）。ログインID欄の編集可否の差は、別途 `frontend` の確認事項

## 原因 B: エラーメッセージが「HTTP 403」「HTTP 400」になる（05-17・05-19・05-20）

### [05-19] 旧パスワード誤り / [05-20] 存在しないログインID

- 項目書の期待: バックエンドから返されたエラーメッセージが表示され、更新されない
- 移植元の挙動: `pw-reset.component.ts` の `onSubmit`。`err.status === 429` は上限超過の文言、`400` は新パスワード欄に `err.error?.message`、それ以外は `submitError`（ログインID欄の下）に `err.error?.message` を出す
- React の挙動: 更新は拒否される（`POST /auth/password/reset` → 403、本文は `{"message":"ログインIDまたは旧パスワードが正しくありません。"}`）が、画面の上部の帯には **「HTTP 403」** と出る。backend のメッセージは出ない
- 原因: `frontend/src/routes/auth/pw-reset.tsx` 57 行目 `setError(err.message)`。`ApiError.message` は `HTTP {status}`（`frontend/src/lib/api-client.ts`）で、本文のメッセージは `err.body` に入っているが使っていない。429 は `message` に `429` を含むかで判定しているので動く

### [05-17] 新パスワード文字数不足

- 項目書の期待: バリデーションエラーが表示される
- 移植元の挙動: 400 のとき `err.error?.message`（backend の「新パスワードは8文字以上で入力してください。」）を**新パスワード欄の下**に出す
- React の挙動: 更新は拒否される（400）が、画面には「HTTP 400」しか出ず、何が悪いか分からない
- 原因: 上と同じ（`err.message` を表示している）。さらに、移植元は 400 を新パスワード欄に出すが、React は欄を分けず上部の帯に出す
- 修正の方針（B 共通）: `ApiError` のとき `err.body` の `message` を取り出して表示する。status が 400 なら `newPassword` の `error` に、それ以外は移植元どおりログインID欄の `error` に出す。05-21（新旧パスワード同一）は「エラーメッセージが表示されるか、更新が拒否される」のため、拒否されている現状でも OK にした（同じ原因でメッセージは「HTTP 400」）

## 原因 C: 更新成功のメッセージが出ない（05-03・05-04）

### [05-03] 正常更新 / [05-04] 正常更新 Chrome

- 項目書の期待: 「パスワードを更新しました。」が表示され、認証後画面（ダッシュボード）に遷移する
- 移植元の挙動: `onSubmit` が `toastService.success(translate.instant('AUTH.PW_RESET.SUCCESS'))` を出してから `authStore.completePasswordReset(response)`（ルーターでダッシュボードへ）
- React の挙動: 更新は成功し、ダッシュボードへ遷移するが、メッセージは出ない
- 原因（2 つ）:
  - `frontend/src/routes/auth/pw-reset.tsx` の成功時（51 行目付近）にトーストを出す処理がない。`AUTH.PW_RESET.SUCCESS` は翻訳に定義済みだが使われていない
  - `completePasswordReset`（`frontend/src/store/auth-store.ts` 195 行目）は `window.location.href` で**ページごと読み込み直す**。トースト（`useToastStore`）はメモリ上にあるため、遷移すると消える。移植元はルーターの遷移なので消えない
- 修正の方針: 成功時に `AUTH.PW_RESET.SUCCESS` のトースト（`showSuccessToast` 相当。`frontend/src/components/shared/toast-store.ts`）を出し、`completePasswordReset` はページ再読み込みをやめてルーターの `navigate` で移る（ほかの経路 `window.location.href` との差は #293 の確認事項）

## 本当の差ではなかったもの（テストの書き直しで解決）

- [05-17] 最初は「8文字以上」のメッセージを新パスワード欄の下に限って探したが、項目書は「バリデーションエラーが表示される」までなので、画面のどこかに出ていれば OK とする書き方に直した（それでも React は「HTTP 400」しか出ず NG）
- [05-21] 最初は新パスワード欄の下のメッセージまで求めたが、項目書は「エラーメッセージが表示されるか、更新が拒否される」の**どちらか**なので、拒否されていれば OK に直した（メッセージの表示は 05-17・05-19 で確かめる）

## 読み替えたもの（OK にした項目）

- [05-16]・[05-17]・[05-18] 最小・最大文字数: 項目書は最小 8 文字（移植元の既定のテナント）。このリポジトリの `test-tenant` は最小 12 文字（`backend/seed.sql`）なので、**最小 8 文字・大小英字・数字・記号必須のテナントを SQL で作って**確かめた（`e2e-spec/src/pw-tenant.ts`。終わると消す）。最大 64 文字は入力欄が 64 文字まで受け付け、更新が成功する
- [05-20] 存在しないログインID: 移植元ではログインID欄が編集できないため、URL の `?username=` で存在しない ID を渡して確かめた（React のパスワード設定画面が持つ入口）
- [05-23]〜[05-38] パスワードポリシーの組み合わせ（16 通り）: 組み合わせごとに専用テナントを SQL で作り、必須の文字種を 1 つ欠くパスワード（必須の文字種がない組み合わせは最小文字数に足りないパスワード）で更新が拒否されること、続けて必須の文字種をすべて含むパスワードで更新が成功しダッシュボードへ遷移することを確かめた。16 通りとも OK
- [05-04] 正常更新 Chrome: Playwright の Chromium（Chrome と同じエンジン）。Chrome 本体（channel: chrome）では確かめていない
