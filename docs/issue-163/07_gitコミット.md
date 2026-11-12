# 07_gitコミット

## コミット分割案

1. **`#163 issue-163 ログインのパスワード有効期限切れ判定(reason=EXPIRED)の移植漏れを修正`**（コミット済み）
   - `backend/app/services/auth_service.py`・`backend/tests/unit/test_auth_service.py`・`backend/seed.sql`

2. **`#163 issue-163 frontend-angularにPlaywrightを導入しログインE2Eテストを実装`**
   - `frontend-angular/playwright.config.ts`
   - `frontend-angular/e2e/fixtures/auth.fixture.ts`
   - `frontend-angular/e2e/login.spec.ts`
   - `frontend-angular/e2e/README.md`
   - `frontend-angular/package.json`（`@playwright/test`依存追加、`test:e2e`スクリプト追加）
   - `frontend-angular/package-lock.json`
   - `frontend-angular/.gitignore`（レポート出力先の除外）

3. （必要であれば）ドキュメント更新のみのコミット（`docs/issue-163/06_タスクリスト.md`のチェック更新等）
