# E2Eテスト（Playwright）

`25DA61_結合テスト項目書_md/` の結合テスト項目書を自動化したE2Eテスト。

## 事前準備

```bash
# プロジェクトルートで実行
docker compose up -d
cd backend && alembic upgrade head
docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql

cd frontend-angular
npm run start:local
```

## 実行

```bash
cd frontend-angular
npx playwright test
```

## レポート確認

```bash
npx playwright show-report
```
