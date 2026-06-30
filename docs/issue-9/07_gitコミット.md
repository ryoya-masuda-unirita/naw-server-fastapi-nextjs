# git コミット分割案：ユーザー管理 API（CRUD・プロフィール）

## コミット分割方針

実装・テストを機能単位で3コミットに分割する。

---

## コミット一覧

### コミット 1: スキーマ・セキュリティの追加

```
#9 issue-9 ユーザー管理APIのスキーマと require_admin を追加
    - app/schemas/user.py を作成（リクエスト・レスポンス Pydantic スキーマ）
    - app/core/security.py に require_admin 依存関数を追加
```

対象ファイル:
- `backend/app/schemas/user.py`（新規）
- `backend/app/core/security.py`（変更）

---

### コミット 2: サービス・ルーターの実装

```
#9 issue-9 ユーザー管理サービス・ルーターを実装
    - app/services/user_service.py を作成（CRUD・プロフィール・パスワード自動生成）
    - app/routers/users.py を作成（6エンドポイント）
    - app/main.py に admin_router・user_router を登録
```

対象ファイル:
- `backend/app/services/user_service.py`（新規）
- `backend/app/routers/users.py`（新規）
- `backend/app/main.py`（変更）

---

### コミット 3: テストの追加

```
#9 issue-9 ユーザー管理APIのテストを追加
    - tests/unit/test_user_service.py を作成（17ケース）
    - tests/integration/test_users.py を作成（9ケース）
```

対象ファイル:
- `backend/tests/unit/test_user_service.py`（新規）
- `backend/tests/integration/test_users.py`（新規）
