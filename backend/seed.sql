\set ON_ERROR_STOP on

-- 開発用シードデータ
-- 実行: docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql

-- テストテナント
INSERT INTO tenants (id, name, owner)
VALUES ('test-tenant', 'テスト用テナント', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 管理者ユーザー (id 固定: 他テーブルから参照しやすくするため)
-- login_id: admin / password: admin@1234 (bcrypt ハッシュ)
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000001',
    'admin',
    'test-tenant',
    '管理者',
    'ADMIN',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

-- 管理者ユーザーのパスワード履歴
-- password: admin@1234 (bcrypt ハッシュ)
INSERT INTO password_histories (tenant_id, user_id, password)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000001',
    '$2b$12$3ht/pj8ZfAobpR5/pPFwTe91zFqH.jyKLk8hMvDg/QGVvqX/phwJa'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000001'
);

-- 一般ユーザー1 (id 固定: グループ機能の動作確認用)
-- login_id: user01 / password: user01@1234 (bcrypt ハッシュ)
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000002',
    'user01',
    'test-tenant',
    'ユーザー1',
    'USER',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

INSERT INTO password_histories (tenant_id, user_id, password)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000002',
    '$2b$12$ZwBI0QHA5gMqp9S.Zg4r6.bR0Teg1bqePuWTCdWWqZh5iP/m0SYTq'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000002'
);

-- 一般ユーザー2 (id 固定: グループ機能の動作確認用)
-- login_id: user02 / password: user02@1234 (bcrypt ハッシュ)
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000003',
    'user02',
    'test-tenant',
    'ユーザー2',
    'USER',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

INSERT INTO password_histories (tenant_id, user_id, password)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000003',
    '$2b$12$Om9LRnmrQsLKz/FmBM2T/ejEE3GCo1pmXu9jAHTEqv85z7IcLP6Vi'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000003'
);
