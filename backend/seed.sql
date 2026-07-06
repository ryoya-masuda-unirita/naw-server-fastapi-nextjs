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

-- 動作確認用グループ (id 固定: アシスタント機能の動作確認用)
INSERT INTO groups (id, tenant_id, name)
VALUES (
    '20000000000040008000000000000001',
    'test-tenant',
    '動作確認用グループ'
)
ON CONFLICT (id) DO NOTHING;

-- user01を動作確認用グループに追加
INSERT INTO groups_users (group_id, tenant_id, user_id, is_admin)
VALUES (
    '20000000000040008000000000000001',
    'test-tenant',
    '00000000-0000-4000-8000-000000000002',
    false
)
ON CONFLICT (group_id, user_id, tenant_id) DO NOTHING;

-- アシスタント (id 固定: 動作確認用)
INSERT INTO assistants (id, tenant_id, type, name, description, include_history)
VALUES (
    '10000000000040008000000000000001',
    'test-tenant',
    'SAAS_CHAT',
    '汎用アシスタント',
    '一般的な質問に回答するアシスタント',
    true
)
ON CONFLICT (id) DO NOTHING;

-- 動作確認用グループにアシスタントを紐付け
INSERT INTO groups_assistants (group_id, assistant_id, tenant_id)
VALUES (
    '20000000000040008000000000000001',
    '10000000000040008000000000000001',
    'test-tenant'
)
ON CONFLICT (group_id, assistant_id, tenant_id) DO NOTHING;
