# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-229/00_チケット内容.md`〜`07_gitコミット.md` |
| 2 | テナントIDの保存・ヘッダ送信とログイン画面の入力欄を追加（テストを含む。実装とテストを同じコミットにまとめた） | `frontend/src/lib/api-client.ts`, `frontend/src/types/auth.ts`, `frontend/src/store/auth-store.ts`, `frontend/src/routes/auth/login.tsx`, `frontend/public/i18n/ja.json`, `frontend/public/i18n/en.json`, `frontend/src/lib/api-client-tenant.test.ts`, `frontend/src/store/auth-store.test.ts`, `frontend/src/routes/auth/login.test.tsx` |
| 3 | 動作確認結果の記録 | `docs/issue-229/06_タスクリスト.md`, `docs/issue-229/08_動作確認.md` |

## 各コミットメッセージ案

```
#229 issue-229 01_要件定義〜07_gitコミットを作成
    - React ログイン画面へのテナントID入力移植の要件・設計・テスト設計をまとめた
```

```
#229 issue-229 ログイン画面にテナントID入力を追加しX-Tenant-IDヘッダを送る
    - api-client.ts にテナントIDの保存・削除関数を追加
    - ログインAPI呼び出し前にテナントIDを保存し、失敗時は削除する
    - ログイン後・パスワードリセット後のテナントID取得用のセッション確認呼び出しを削除
    - ログイン画面にテナントID入力欄を追加し、i18n に文言を追加
    - api-client-tenant.test.ts を追加し、auth-store.test.ts・login.test.tsx をテナントID入力に合わせて更新
```

```
#229 issue-229 08_動作確認.mdに確認結果を記録
```
