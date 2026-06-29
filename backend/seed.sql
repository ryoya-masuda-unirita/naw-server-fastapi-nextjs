\set ON_ERROR_STOP on

-- 開発用シードデータ
-- 実行: docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql

-- テストテナント
INSERT INTO tenants (id, name, owner)
VALUES ('test-tenant', 'テスト用テナント', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 管理者ユーザー (id 固定: 他テーブルから参照しやすくするため)
-- login_id: admin / password: admin
INSERT INTO users (id, login_id, tenant_id, name, password, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'admin',
    'test-tenant',
    '管理者',
    '$2b$12$3ht/pj8ZfAobpR5/pPFwTe91zFqH.jyKLk8hMvDg/QGVvqX/phwJa',
    'ADMIN',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;
