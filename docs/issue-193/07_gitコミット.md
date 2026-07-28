# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-193/00_チケット内容.md` |
| 2 | ドキュメント作成 | `docs/issue-193/01_要件定義.md`〜`07_gitコミット.md` |
| 3 | テナント解決ロジックをサブドメイン非依存に変更し、ユーザー管理一覧専用の重複実装を廃止 | `tenant.helpers.ts`, `user-list-tenant.helpers.ts`（削除）, `user-list-auth.service.ts`, `playwright.config.ts`, `README.md` |
| 4 | ログイン画面にテナントID入力欄を追加 | `auth.types.ts`, `auth.store.ts`, `login.component.ts`, `login.component.html`, `ja.json`, `en.json` |
| 5 | モックのセッションキー参照を共通定数経由に修正 | `auth.mock.ts` |
| 6 | テストをサブドメイン非依存の実装に合わせて更新 | `tenant.helpers.spec.ts`, `user-list-tenant.helpers.spec.ts`（削除）, `auth.interceptor.spec.ts`, `login.component.spec.ts`, `auth.store.spec.ts`, `e2e/fixtures/auth.fixture.ts`, `e2e/*.spec.ts` |
| 7 | 動作確認結果の記録 | `docs/issue-193/08_動作確認.md` |

## 各コミットメッセージ案

```
#193 issue-193 00_チケット内容.md を作成
```

```
#193 issue-193 01_要件定義〜07_gitコミットを作成
    - サブドメイン廃止に伴う要件定義・基本設計・詳細設計・テスト設計をまとめた
```

```
#193 issue-193 テナント解決ロジックをサブドメイン非依存にする
    - tenant.helpers.tsのresolveTenantIdからサブドメイン抽出処理を削除
    - persistTenantIdを追加
    - user-list-tenant.helpers.tsを削除し、共通のresolveTenantIdに一本化
    - user-list-auth.service.tsからサブドメインへの補修（repair）処理を削除
```

```
#193 issue-193 ログイン画面にテナントID入力欄を追加
    - LoginRequestにtenantIdを追加
    - AuthStore.loginでログインAPI呼び出し前にテナントIDをセッションへ保存するよう変更
    - login.component.ts/.htmlにテナントID入力欄を追加
    - i18nにテナントIDのラベル・プレースホルダーを追加
```

```
#193 issue-193 モックのセッションキー参照をSTORAGE_KEYS定数経由に修正
    - auth.mock.tsの文字列リテラル参照をSTORAGE_KEYS.USER/TENANT_IDに置き換え
```

```
#193 issue-193 サブドメイン廃止に合わせてテストを更新
    - tenant.helpers.spec.tsからサブドメインスタブを削除し、persistTenantIdのテストを追加
    - user-list-tenant.helpers.spec.tsを削除
    - auth.interceptor.spec.tsからサブドメインスタブを削除
    - login.component.spec.tsにテナントID関連のテストを追加
    - auth.store.spec.tsのloginテストをテナントID永続化タイミングに合わせて更新
```

```
#193 issue-193 08_動作確認.mdに確認結果を記録
```
