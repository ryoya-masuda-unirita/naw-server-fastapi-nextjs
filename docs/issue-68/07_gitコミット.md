# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-68/*.md` |
| 2 | ログインキー認証APIを実装 | `schemas/auth.py`, `repositories/user_repository.py`, `services/auth_service.py`, `routers/auth.py` |
| 3 | ログインキー認証APIのテストを追加 | `tests/integration/conftest.py`, `tests/unit/test_auth_service.py`, `tests/integration/test_auth.py` |

## 各コミットメッセージ案

```
#68 issue-68 ログインキー認証APIのドキュメントを作成
    - 00_チケット内容〜06_タスクリストを作成し実装方針を整理
```

```
#68 issue-68 ログインキー認証APIを実装
    - LoginKeyRequestスキーマを追加
    - UserRepositoryにfind_by_login_keyを追加（テナントIDも条件に含めテナント分離を担保）
    - AuthServiceにlogin_with_login_keyを追加
    - POST /auth/login-keyエンドポイントを追加
```

```
#68 issue-68 ログインキー認証APIのテストを追加
    - 正常系・存在しないログインキー・別テナントのログインキー・ヘッダー未指定のテストを追加
    - access_token Cookie発行の確認テストを追加
```
