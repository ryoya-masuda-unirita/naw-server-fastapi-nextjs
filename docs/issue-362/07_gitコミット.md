# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | パスワード再設定画面に移植元と同じ入力チェックとメッセージを出す | `frontend/src/routes/auth/pw-reset*.tsx`、`frontend/src/lib/utils/auth-validation*.ts`、`frontend/src/store/auth-store.ts`、`e2e-spec/tests/05-password-reset.spec.ts`、`docs/issue-362/` |

## 各コミットメッセージ案

```
#362 issue-362 パスワード再設定画面に移植元と同じ必須チェックとエラー・成功メッセージを出す
    - 必須・不一致・64 文字・半角のチェックを欄の下の文言で出す
    - 失敗時は backend の message を、400 は新パスワード欄、それ以外はログインID欄の下に出す
    - 成功時にトーストを出し、ルーターでダッシュボードへ遷移する
    - ログインID欄を移植元と同じく編集不可にした
```
