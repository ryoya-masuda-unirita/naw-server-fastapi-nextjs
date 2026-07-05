# 07_gitコミット

## コミット分割案

### 1. ドキュメント作成（済）

```
#20 issue-20 00_チケット内容.md を作成
```

```
#20 issue-20 01_要件定義.md・02_基本設計.md を作成
```

```
#20 issue-20 03_詳細設計.md〜07_gitコミット.md を作成
```

### 2. 実装

```
#20 issue-20 ログイン認証をCookieセッション方式に対応
    - Settings.cookie_secure を追加しCookieのSecure属性を環境ごとに切り替え可能にする
    - security.pyにaccess_token Cookieの発行・削除ヘルパーを追加
    - get_current_userをCookie優先・Authorizationヘッダーフォールバック方式に変更
    - login/logout/password-reset/get_authの各エンドポイントでCookieを設定・削除するよう変更
```

### 3. テスト

```
#20 issue-20 Cookie認証のテストを追加
    - tests/unit/test_config.pyにcookie_secureのテストを追加
    - tests/unit/test_security.pyにCookie発行・削除ヘルパーのテストを追加
    - tests/integration/test_auth.pyにログイン時Cookie発行・ログアウト時Cookie削除・Cookie認証・未認証401のテストを追加
    - tests/integration/test_users.pyにCookieのみでの認証テストを追加
```

### 4. 動作確認ドキュメント・code-review反映（動作確認・レビュー完了後）

```
#20 issue-20 08_動作確認.md を作成
```

```
#20 issue-20 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 全自動モードのため、実装・テスト・動作確認・PR作成・code-review・修正までを連続して実施する
- 各コミットの粒度は上記を目安とし、実装中に発見した追加修正が発生した場合はコミットを分けて記録する
