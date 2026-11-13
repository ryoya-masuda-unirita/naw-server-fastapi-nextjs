# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ログインキー認証の失敗でセッションを保ちアラートを出す | `frontend/src/store/auth-store.ts`、`frontend/src/lib/initializers/*`、`frontend/src/main.tsx`、テスト、`e2e-spec/tests/03-login.spec.ts`、`docs/issue-361/` |

## 各コミットメッセージ案

```
#361 issue-361 ログインキーでの認証に失敗してもセッションを保ちアラートを出す
    - loginWithKey の失敗時にユーザー情報とテナントIDを消さないようにした
    - URL の tenantId で上書きしたテナントIDを、失敗時に上書き前へ戻す
    - 失敗時に AUTH.LOGIN_KEY.ERROR のエラートーストを出す
```
