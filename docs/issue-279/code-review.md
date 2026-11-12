# code-review 結果

`/code-review 304` の結果（検証役のエージェントは回していないため、各指摘は候補として扱い、コードを読んで判断した）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `frontend/src/main.tsx`・`frontend/src/lib/initializers/login-key.ts` | StrictMode の2回目の effect が、ログインキー認証より先にセッション確認へ進み、認証できても未ログインになる | 対応済み |
| 2 | 🟡 注意 | `frontend/src/lib/utils/form-errors.ts` | 翻訳キー `VALIDATION.PASSWORD_ASCII_ONLY` が React の ja.json・en.json に無い | 対応しない（#277） |
| 3 | 🟡 注意 | `frontend/src/main.tsx` | ログインキー失敗の通知（`onError`）を渡していない。`LOGIN_KEY_ERROR_MESSAGE_KEY` が未使用 | 一部対応 |
| 4 | 🟡 注意 | `frontend/src/hooks/use-credit-usage.ts` | 移植元はシングルトンで requestId を共有するが、React は hook ごとに持つ | 対応しない |
| 5 | 🟡 注意 | `frontend/src/hooks/use-token-usage.ts` | 期間をコンポーネントごとに固定するため、複数の利用者で queryKey が分かれる | 対応しない |
| 6 | 🟡 注意 | `frontend/src/lib/utils/scroll-to-error.ts` | `#${elementId}` をエスケープしないため、数字で始まる id などで例外になる | 対応済み |
| 7 | 🟡 注意 | `frontend/src/lib/api-client.ts` | 中断の判定が `DOMException`・`AbortError` だけで、理由付きの abort やタイムアウトを通信エラー扱いにする | 対応済み |
| 8 | 🟡 注意 | `frontend/src/lib/constants/api-paths.ts`・`frontend/src/mocks/utils.ts` | `ADMIN.USERS.DETAIL(':loginId')` が `%3AloginId` になり、MSW のパスパラメータにならない | 対応済み |
| 9 | 🔵 提案 | `frontend/src/hooks/use-api-error-interceptor.ts` | App で `useTranslation` を呼ぶと、翻訳ファイルの読み込みまで App が suspend し、起動時のセッション確認が遅れる | 対応済み |
| 10 | 🔵 提案 | `frontend/src/lib/api-error-handler.ts` | `'/auth/'` を api-client と二重に持っている | 対応済み |

## 詳細

### 1. StrictMode でのログインキー認証とセッション確認の競合（🔴 致命的）→ 対応済み

開発時は StrictMode により起動の effect が2回走る。1回目が URL から鍵を消して認証を待つ間に、2回目は鍵が無いためすぐに `ensureInitialized()`（`GET /api/auth`）へ進み、Cookie が無いまま 401 → 未ログインで確定していた。`runLoginKeyInitializer` に実行中の Promise を持たせ、認証中の2回目の呼び出しは同じ Promise を待つようにした。回帰テスト「認証中に呼ばれた2回目は、認証が終わるまで待つこと」を追加した。

### 2. 翻訳キー `VALIDATION.PASSWORD_ASCII_ONLY` が無い（🟡 注意）→ 対応しない

翻訳ファイルは #277（i18n）の担当で、移植元の ja.json・en.json を移せばキーが入る。このキーを使う画面もまだ無い。PR 本文と 03 に申し送りとして書いた。

### 3. ログインキー失敗の通知を渡していない（🟡 注意）→ 一部対応

通知先のトーストは #278 で移植するため、現時点では渡せない（PR 本文・03 に申し送り）。未使用だった `LOGIN_KEY_ERROR_MESSAGE_KEY` は「使われないコードは削除する」に従って削除し、キー名はコメントに残した。翻訳キー `AUTH.LOGIN_KEY.ERROR` は #277 で入る。

### 4. クレジット利用量の requestId を hook ごとに持つ（🟡 注意）→ 対応しない

移植元で `CreditUsageService` を使うのは利用量ダイアログ（`usage-dialog.component.ts`）だけで、同じコンポーネントが `fetchUsage()` と表示の両方を行う。1か所で使う限り振る舞いは移植元と同じ。`fetchUsage` のたびに queryKey が変わり前回のデータが消える点も移植元と同じ。利用者が2か所以上になったら共有の状態にする。

### 5. トークン利用量の期間をコンポーネントごとに固定する（🟡 注意）→ 対応しない

4 と同じく、移植元の利用者は利用量ダイアログだけ。移植元も Service 生成時に1回だけ期間を計算し、日付をまたいでも更新しない。

### 6. `#${elementId}` のエスケープ漏れ（🟡 注意）→ 対応済み

`document.getElementById` で要素を取り、`root.contains` でコンテナ内かを確かめるようにした。回帰テスト「数字で始まる id でも例外にならずスクロールすること」を追加した。

### 7. 中断の判定（🟡 注意）→ 対応済み

`options.signal?.aborted` なら元の例外をそのまま投げ、共通のエラー処理にも通知しないようにした。回帰テスト「呼び出し側が中断したら、通信エラーにせず元の理由のまま投げること」を追加した。

### 8. encode されたパスパラメータ（🟡 注意）→ 対応済み

`mockPath` で `%3A` を `:` に戻すようにした（`ADMIN.USERS.DETAIL` は移植元と同じく loginId を encode する必要があるため、パス定数側は変えない）。`mocks/utils.test.ts` で `ADMIN.USERS.DETAIL(':loginId')` が `user@example.com` に一致することを確認した。

### 9. `useTranslation` による suspend（🔵 提案）→ 対応済み

`useTranslation` をやめ、エラーが起きた時点で `@/lib/i18n` の `i18n.t` から引くようにした。

### 10. `'/auth/'` の二重定義（🔵 提案）→ 対応済み

api-client の `AUTH_API_PATH_PREFIX` を export し、`api-error-handler.ts` から使うようにした。
