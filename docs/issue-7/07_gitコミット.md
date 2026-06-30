# 07 git コミット分割案

## コミット戦略

実装フェーズごとに適切な粒度でコミットを分割し、各コミットが機能的に独立・完全な状態を保つ。

---

## コミット計画

### コミット 1: DB マイグレーション・モデル

```
#7 issue-7 DB マイグレーション・モデル追加
  - password_histories テーブル追加（Alembic 002）
  - users テーブルから password カラム削除
  - PasswordHistory ORM モデル新設
  - User モデルから password フィールド削除
  - seed.sql 更新（password_histories に初期パスワード）
```

**変更ファイル**:
- `backend/alembic/versions/002_add_password_histories.py`
- `backend/app/models/user.py`
- `backend/app/models/password_history.py`
- `backend/seed.sql`

**確認手順**:
- `alembic upgrade head` で実行成功
- `psql` でテーブル構造確認

---

### コミット 2: セキュリティ・ユーティリティ層

```
#7 issue-7 JWT・パスワードハッシュユーティリティ実装
  - core/security.py で JWT 生成・検証・デコード機能実装
  - パスワードハッシュ（bcrypt）・検証機能実装
  - 認証済みユーザー取得・テナント ID 取得用 Depends 実装
  - schemas/auth.py で Pydantic スキーマ新設
```

**変更ファイル**:
- `backend/app/core/security.py`
- `backend/app/schemas/auth.py`

**確認手順**:
- `import backend.app.core.security` で構文エラーなし
- Pydantic スキーマバリデーション動作確認

---

### コミット 3: ビジネスロジック層

```
#7 issue-7 認証・パスワード管理サービス実装
  - AuthService で login・reset_password メソッド実装
  - PasswordService で強度チェック・履歴チェック・リセット機能実装
```

**変更ファイル**:
- `backend/app/services/auth_service.py`
- `backend/app/services/password_service.py`

**確認手順**:
- `import` で構文エラーなし
- 単体テスト実行

---

### コミット 4: ルーター・エンドポイント

```
#7 issue-7 認証 API エンドポイント実装
  - routers/auth.py で /auth/login・/auth/logout・/auth/password/reset エンドポイント実装
  - main.py にルーター登録
```

**変更ファイル**:
- `backend/app/routers/auth.py`
- `backend/app/main.py`

**確認手順**:
- サーバー起動で エラーなし
- Swagger UI で エンドポイント確認

---

### コミット 5: テスト実装

```
#7 issue-7 認証・パスワード管理テスト実装
  - conftest.py でテスト用フィクスチャ追加
  - PasswordService ユニットテスト実装
  - AuthService ユニットテスト実装
  - JWT・パスワードハッシュユーティリティテスト実装
  - 認証 API 統合テスト実装
```

**変更ファイル**:
- `backend/tests/conftest.py`
- `backend/tests/services/test_password_service.py`
- `backend/tests/services/test_auth_service.py`
- `backend/tests/core/test_security.py`
- `backend/tests/api/test_auth.py`

**確認手順**:
- `pytest backend/tests/ -v` ですべて PASSED

---

### コミット 6: その他変更・最終調整

```
#7 issue-7 テスト設定・トランケート対象追加
  - tests/integration/conftest.py に password_histories トランケート追加
```

**変更ファイル**:
- `backend/tests/integration/conftest.py`

**確認手順**:
- 既存統合テスト実行で問題なし

---

## 各コミットメッセージフォーマット

```
#{番号} issue-{番号} {変更概要を1文で}
    - 変更詳細1
    - 変更詳細2
    - ...
```

例:
```
#7 issue-7 DB マイグレーション・モデル追加
    - password_histories テーブル追加（Alembic 002）
    - users テーブルから password カラム削除
    - PasswordHistory ORM モデル新設
    - User モデルから password フィールド削除
    - seed.sql 更新（password_histories に初期パスワード）
```

---

## コミット前の確認チェックリスト

各コミット前に以下を確認すること:

- [ ] ファイルが正しく変更されている (`git diff`)
- [ ] 不要なコメント・デバッグコード削除
- [ ] 既存テストで問題ないことを確認
- [ ] コミットメッセージが適切か確認

---

## 本番運用での参考

このコミット分割は段階的にロールバック可能な設計になっている：

1. コミット 1-4 までで、**マイグレーション + API は動作する状態**
2. コミット 5-6 は テスト・確認用のため、本番では不要な可能性あり
3. 本番環境での不具合時は、各コミット単位でロールバック可能
