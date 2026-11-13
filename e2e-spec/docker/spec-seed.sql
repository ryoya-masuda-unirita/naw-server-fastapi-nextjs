\set ON_ERROR_STOP on

-- e2e-spec 専用の追加データ（backend/seed.sql・seed-demo.sql の後に流す）。
-- seed にはシステム管理者（role = SYSTEM）がいないため、権限別のログインの確認用に足す。
-- login_id: system-admin / password: admin@1234（admin と同じ bcrypt ハッシュ）
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000301',
    'system-admin',
    'test-tenant',
    'システム管理者',
    'SYSTEM',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

INSERT INTO password_histories (tenant_id, user_id, password)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000301',
    '$2b$12$1zvIbDJRtU4CWncRzqLUouA1sSru4pSUPE41qvAODkSPK1qbpcgW.'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000301'
);
