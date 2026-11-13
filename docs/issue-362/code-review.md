# code-review 結果

差分を自分でレビューした（移植元の `pw-reset.component.ts`・`.html`・`.spec.ts` と突き合わせた）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `frontend/src/routes/auth/pw-reset.tsx` | ログインID欄を編集不可にしたため、ユーザー ID を持たずに画面を開くと更新できない | 対応しない |
| 2 | 🟡 注意 | `frontend/src/store/auth-store.ts` | `completePasswordReset` がページを読み込み直さなくなった | 対応しない |
| 3 | 🔵 提案 | `frontend/src/routes/auth/pw-reset.tsx` | `ApiError` 以外の例外はログに出して終わる | 対応しない |

🔴 致命的は 0 件。

## 詳細

### 1. ログインID欄の無効化（🟡）→ 対応しない

移植元と同じ仕様（現行の `pw-reset.component.ts` は `disabled: true` で、spec もそれを確かめている）。画面への入口（ログイン後の自動遷移、ユーザーメニュー）は ID を渡す。入口がなく、ログイン中でもない場合は移植元と同じく更新が成功しない。

### 2. ページの読み込み直しをやめた（🟡）→ 対応しない

ページごと読み込み直すと成功トーストが消えるため（移植元はルーターで遷移する）。遷移後は `RequireAuth` が認証済みのストアを見る。ほかの経路の `window.location.href` との差は #293 の確認事項。

### 3. 想定外の例外（🔵）→ 対応しない

`apiClient` は失敗を必ず `ApiError`（通信失敗は status 0）で投げる。それ以外は不具合なので、握り潰さず `console.error` に残している。
