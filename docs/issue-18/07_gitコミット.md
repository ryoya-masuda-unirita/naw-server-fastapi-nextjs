# git コミット分割案：ログインAPIのCORS未設定とセッションAPIのパス重複を修正

## コミット分割方針

実装・テストを機能単位で2コミットに分割する。

---

## コミット一覧

### コミット 1: CORS設定の追加

```
#18 issue-18 バックエンドにCORS設定を追加
    - app/core/config.py にcors_allowed_origins・cors_allowed_origin_regexを追加
    - app/main.py にCORSMiddlewareを追加
    - .env/.env.exampleにCORS_ALLOWED_ORIGINS等を追加
```

対象ファイル:
- `backend/app/core/config.py`（変更）
- `backend/app/main.py`（変更）
- `backend/.env`（変更）
- `backend/.env.example`（変更）

---

### コミット 2: セッションAPIのパス重複解消とテストの追加

```
#18 issue-18 セッションAPIのパス重複を解消しCORS設定のテストを追加
    - frontend/src/lib/constants/api-paths.tsのSESSIONを/authに修正
    - tests/unit/test_config.pyを作成
    - tests/unit/test_cors.pyを作成
```

対象ファイル:
- `frontend/src/lib/constants/api-paths.ts`（変更）
- `backend/tests/unit/test_config.py`（新規）
- `backend/tests/unit/test_cors.py`（新規）
