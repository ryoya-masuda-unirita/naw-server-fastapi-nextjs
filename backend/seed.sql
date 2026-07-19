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
    '$2b$12$1zvIbDJRtU4CWncRzqLUouA1sSru4pSUPE41qvAODkSPK1qbpcgW.'
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

-- 初回ログイン確認用ユーザー (Issue #163: E2Eテスト「初回PW遷移」用)
-- login_id: first-login-user / password: firstlogin@1234 (bcrypt ハッシュ)
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000004',
    'first-login-user',
    'test-tenant',
    '初回ログインユーザー',
    'USER',
    true
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

INSERT INTO password_histories (tenant_id, user_id, password)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000004',
    '$2b$12$XeQyTucT5JULKxd7wjh./et9ElfEncbVmE6wB2UxcBsdMyrI35O5K'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000004'
);

-- パスワード期限切れ確認用ユーザー (Issue #163: E2Eテスト「期限切れPW遷移」用)
-- login_id: expired-password-user / password: expired@1234 (bcrypt ハッシュ)
-- password_histories.expired_at を過去日時にすることで有効期限切れ状態を再現する
INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)
VALUES (
    '00000000-0000-4000-8000-000000000005',
    'expired-password-user',
    'test-tenant',
    'パスワード期限切れユーザー',
    'USER',
    false
)
ON CONFLICT (login_id, tenant_id) DO NOTHING;

INSERT INTO password_histories (tenant_id, user_id, password, expired_at)
SELECT
    'test-tenant',
    '00000000-0000-4000-8000-000000000005',
    '$2b$12$tLZYNeuzRaPKUPkzYYtBNuTzv/F7kBlZTtw9XfQ.GlZfEhCgvaAYq',
    now() - interval '1 day'
WHERE NOT EXISTS (
    SELECT 1 FROM password_histories
    WHERE user_id = '00000000-0000-4000-8000-000000000005'
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

-- 動作確認用テナントエンドポイント (id 固定)
INSERT INTO tenant_endpoints (id, tenant_id, type, endpoint_name, endpoint, api_key)
VALUES (
    '30000000000040008000000000000001',
    'test-tenant',
    'AZURE_OPENAI_CHAT',
    'Azure OpenAI (動作確認用)',
    'https://example.openai.azure.com',
    'dummy-api-key-for-seed'
)
ON CONFLICT (id) DO NOTHING;

-- 動作確認用アシスタントとエンドポイントの紐付け
INSERT INTO assistants_endpoints (assistant_id, endpoint_id, tenant_id, model)
VALUES (
    '10000000000040008000000000000001',
    '30000000000040008000000000000001',
    'test-tenant',
    'gpt-4o'
)
ON CONFLICT (assistant_id, endpoint_id) DO NOTHING;

-- プロンプトテンプレート (id 固定: 動作確認用グループに紐付け済み)
INSERT INTO prompt_templates (id, tenant_id, name, description, system_prompt)
VALUES (
    '40000000000040008000000000000001',
    'test-tenant',
    '丁寧な回答テンプレート',
    '丁寧な口調で回答するテンプレート',
    'あなたは丁寧な口調で回答するアシスタントです。'
)
ON CONFLICT (id) DO NOTHING;

-- 動作確認用グループにプロンプトテンプレートを紐付け
INSERT INTO groups_prompt_templates (group_id, prompt_template_id, tenant_id)
VALUES (
    '20000000000040008000000000000001',
    '40000000000040008000000000000001',
    'test-tenant'
)
ON CONFLICT (group_id, prompt_template_id, tenant_id) DO NOTHING;

-- プロンプトテンプレート (id 固定: グループ未紐付け、除外フィルタの動作確認用)
INSERT INTO prompt_templates (id, tenant_id, name, description, system_prompt)
VALUES (
    '40000000000040008000000000000002',
    'test-tenant',
    '未紐付けテンプレート',
    'どのグループにも紐付いていないテンプレート',
    'あなたは簡潔に回答するアシスタントです。'
)
ON CONFLICT (id) DO NOTHING;

-- アシスタントカテゴリ (id 固定: 動作確認用)
INSERT INTO assistant_categories (id, tenant_id, name, description, updated_user_id)
VALUES (
    '50000000000040008000000000000001',
    'test-tenant',
    '業務効率化',
    '業務効率化を目的としたアシスタントのカテゴリ',
    '00000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- 動作確認用アシスタントとカテゴリの紐付け
INSERT INTO assistant_category_mappings (assistant_id, category_id, tenant_id)
VALUES (
    '10000000000040008000000000000001',
    '50000000000040008000000000000001',
    'test-tenant'
)
ON CONFLICT (assistant_id, category_id) DO NOTHING;

-- AIモデル (id自動採番: 動作確認用アシスタント作成・編集画面のモデル選択肢)
INSERT INTO ai_models (endpoint_type, name, max_tokens, active, token_weight)
SELECT 'AZURE_OPENAI_CHAT', 'gpt-4o', 128000, true, 1.0
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE name = 'gpt-4o');

INSERT INTO ai_models (endpoint_type, name, max_tokens, active, token_weight)
SELECT 'CLAUDE_CHAT', 'claude-3-5-sonnet', 200000, true, 1.0
WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE name = 'claude-3-5-sonnet');

-- フィードバックユーザー一覧API 動作確認用ルーム
INSERT INTO rooms (id, tenant_id, name, default_assistant_id, user_id, rating)
VALUES
(
    '60000000000040008000000000000001',
    'test-tenant',
    'フィードバック確認用ルーム1',
    '10000000000040008000000000000001',
    '00000000-0000-4000-8000-000000000002',
    'EXCELLENT'
),
(
    '60000000000040008000000000000002',
    'test-tenant',
    'フィードバック確認用ルーム2',
    '10000000000040008000000000000001',
    '00000000-0000-4000-8000-000000000002',
    'GOOD'
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックユーザー一覧API 動作確認用メッセージ
INSERT INTO messages (id, tenant_id, room_id, assistant_id)
VALUES (
    '70000000000040008000000000000001',
    'test-tenant',
    '60000000000040008000000000000001',
    '10000000000040008000000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックユーザー一覧API 動作確認用メッセージフィードバック
INSERT INTO message_feedbacks (id, tenant_id, user_id, message_id, rating, index_id)
VALUES (
    '80000000000040008000000000000001',
    'test-tenant',
    '00000000-0000-4000-8000-000000000002',
    '70000000000040008000000000000001',
    'GOOD',
    NULL
)
ON CONFLICT (message_id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用アシスタント（LOCAL_SERVER連携確認用）
INSERT INTO assistants (id, tenant_id, type, name, description, include_history)
VALUES (
    '10000000000040008000000000000002',
    'test-tenant',
    'SECURE',
    'ローカル連携アシスタント',
    'message.content欠損時のassistantIdToServerMap確認用',
    false
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用LOCAL_SERVERエンドポイント
INSERT INTO tenant_endpoints (id, tenant_id, type, endpoint_name, endpoint, api_key)
VALUES (
    '30000000000040008000000000000002',
    'test-tenant',
    'LOCAL_SERVER',
    'Local Server (feedbackMessage確認用)',
    'http://local-server.example',
    'local-server-key'
)
ON CONFLICT (id) DO NOTHING;

-- ローカル連携アシスタントとLOCAL_SERVERエンドポイントの紐付け
INSERT INTO assistants_endpoints (assistant_id, endpoint_id, tenant_id, model)
VALUES (
    '10000000000040008000000000000002',
    '30000000000040008000000000000002',
    'test-tenant',
    'local-server-model'
)
ON CONFLICT (assistant_id, endpoint_id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用ルーム
INSERT INTO rooms (id, tenant_id, name, default_assistant_id, user_id, rating)
VALUES (
    '60000000000040008000000000000003',
    'test-tenant',
    'フィードバックメッセージ確認用ルーム',
    '10000000000040008000000000000001',
    '00000000-0000-4000-8000-000000000002',
    'VERY_GOOD'
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用メッセージ
INSERT INTO messages (id, tenant_id, room_id, assistant_id)
VALUES
(
    '70000000000040008000000000000002',
    'test-tenant',
    '60000000000040008000000000000003',
    '10000000000040008000000000000001'
),
(
    '70000000000040008000000000000003',
    'test-tenant',
    '60000000000040008000000000000003',
    '10000000000040008000000000000002'
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用メッセージ本文
INSERT INTO message_contents (
    id,
    tenant_id,
    message_id,
    status,
    question,
    answer
)
VALUES (
    '90000000000040008000000000000001',
    'test-tenant',
    '70000000000040008000000000000002',
    'OK',
    'Responded question',
    'Responded answer'
)
ON CONFLICT (id) DO NOTHING;

-- フィードバックメッセージ取得API 動作確認用メッセージフィードバック
INSERT INTO message_feedbacks (id, tenant_id, user_id, message_id, rating, index_id)
VALUES
(
    '80000000000040008000000000000002',
    'test-tenant',
    '00000000-0000-4000-8000-000000000002',
    '70000000000040008000000000000002',
    'GOOD',
    'folder-responded'
),
(
    '80000000000040008000000000000003',
    'test-tenant',
    '00000000-0000-4000-8000-000000000002',
    '70000000000040008000000000000003',
    'BAD',
    NULL
)
ON CONFLICT (message_id) DO NOTHING;

-- クレジット利用状況ダッシュボードAPI 動作確認用プラン
INSERT INTO plans (id, name, max_users, max_credits_per_month)
VALUES ('plan-standard', 'Standard', 50, 100000)
ON CONFLICT (id) DO NOTHING;

-- クレジット利用状況ダッシュボードAPI 動作確認用サブスクリプション
-- 契約開始日は当月1日固定（動作確認時点で常に有効な請求期間になるようにするため）
INSERT INTO subscriptions (id, tenant_id, plan_id, status, start_date)
VALUES (
    'subscription-test-tenant',
    'test-tenant',
    'plan-standard',
    'ACTIVE',
    date_trunc('month', CURRENT_DATE)
)
ON CONFLICT (id) DO NOTHING;
-- ============================================================
-- 実データに近い規模のダミーデータ (issue-152)
-- dev/staging RDS（Spring Boot版）の件数・構成パターンを参考に
-- （実データそのものはコピーせず）新規に作成する。
-- 追加テナントのユーザーは全員 password: admin@1234 でログインできる
-- （'admin'ユーザーと同じbcryptハッシュを使い回すため）。
-- ============================================================

-- 追加テナント
INSERT INTO tenants (id, name, owner)
VALUES
    ('tenant-demo-a', 'デモ株式会社A', 'demo-a-admin'),
    ('tenant-demo-b', 'デモ株式会社B', 'demo-b-admin')
ON CONFLICT (id) DO NOTHING;

-- 各追加テナントに15名のユーザーを生成 (1人目をADMIN、残りをUSERにする)
INSERT INTO users (login_id, tenant_id, name, role, is_required_password_reset)
SELECT
    t.tenant_id || '-user' || lpad(s::text, 2, '0'),
    t.tenant_id,
    'デモユーザー' || lpad(s::text, 2, '0'),
    (CASE WHEN s = 1 THEN 'ADMIN' ELSE 'USER' END)::userrole,
    false
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 15) AS s
ON CONFLICT (login_id, tenant_id) DO NOTHING;

-- 生成した全ユーザーのパスワード履歴 (password: admin@1234 の bcrypt ハッシュを使い回す)
INSERT INTO password_histories (tenant_id, user_id, password)
SELECT u.tenant_id, u.id, '$2b$12$1zvIbDJRtU4CWncRzqLUouA1sSru4pSUPE41qvAODkSPK1qbpcgW.'
FROM users u
WHERE u.tenant_id IN ('tenant-demo-a', 'tenant-demo-b')
  AND NOT EXISTS (SELECT 1 FROM password_histories ph WHERE ph.user_id = u.id);

-- 各テナントに4グループ
INSERT INTO groups (id, tenant_id, name)
SELECT
    md5(t.tenant_id || '-group-' || s::text),
    t.tenant_id,
    t.tenant_id || ' グループ' || s::text
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 4) AS s
ON CONFLICT (id) DO NOTHING;

-- ユーザーをグループに割り当てる (ユーザー番号を4で割った余りで主グループを決定)
INSERT INTO groups_users (group_id, tenant_id, user_id, is_admin)
SELECT
    md5(u.tenant_id || '-group-' || ((row_number() OVER (PARTITION BY u.tenant_id ORDER BY u.login_id) - 1) % 4 + 1)::text),
    u.tenant_id,
    u.id,
    false
FROM users u
WHERE u.tenant_id IN ('tenant-demo-a', 'tenant-demo-b')
ON CONFLICT (group_id, user_id, tenant_id) DO NOTHING;

-- 各テナントに3カテゴリ
INSERT INTO assistant_categories (id, tenant_id, name, description, updated_user_id)
SELECT
    md5(t.tenant_id || '-category-' || s::text),
    t.tenant_id,
    (ARRAY['業務効率化', '情報検索', 'コミュニケーション支援'])[s],
    (ARRAY['業務効率化を目的としたアシスタントのカテゴリ', '情報検索を目的としたアシスタントのカテゴリ', 'コミュニケーション支援を目的としたアシスタントのカテゴリ'])[s],
    (SELECT u.id FROM users u WHERE u.tenant_id = t.tenant_id AND u.login_id = t.tenant_id || '-user01')
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 3) AS s
ON CONFLICT (id) DO NOTHING;

-- 各テナントに6アシスタント (種別を交互に変える)
INSERT INTO assistants (id, tenant_id, type, name, description, include_history)
SELECT
    md5(t.tenant_id || '-assistant-' || s::text),
    t.tenant_id,
    (CASE (s % 3) WHEN 1 THEN 'SAAS_CHAT' WHEN 2 THEN 'SAAS_RAG' ELSE 'SECURE' END)::assistanttype,
    t.tenant_id || ' アシスタント' || s::text,
    'デモ用アシスタント' || s::text || 'の説明',
    true
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 6) AS s
ON CONFLICT (id) DO NOTHING;

-- アシスタントをカテゴリに割り当てる (3で割った余りでカテゴリを決定)
INSERT INTO assistant_category_mappings (assistant_id, category_id, tenant_id)
SELECT
    md5(t.tenant_id || '-assistant-' || s::text),
    md5(t.tenant_id || '-category-' || ((s - 1) % 3 + 1)::text),
    t.tenant_id
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 6) AS s
ON CONFLICT (assistant_id, category_id) DO NOTHING;

-- アシスタントをグループに割り当てる (6件を4グループへ順繰りに割り当てるため、
-- グループ1・2は2件ずつ、グループ3・4は1件ずつになる)
INSERT INTO groups_assistants (group_id, assistant_id, tenant_id)
SELECT
    md5(t.tenant_id || '-group-' || ((s - 1) % 4 + 1)::text),
    md5(t.tenant_id || '-assistant-' || s::text),
    t.tenant_id
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 6) AS s
ON CONFLICT (group_id, assistant_id, tenant_id) DO NOTHING;

-- 各テナントに6プロンプトテンプレート (最後の1件はどのグループにも紐付けない)
INSERT INTO prompt_templates (id, tenant_id, name, description, system_prompt)
SELECT
    md5(t.tenant_id || '-prompt-' || s::text),
    t.tenant_id,
    t.tenant_id || ' テンプレート' || s::text,
    'デモ用プロンプトテンプレート' || s::text || 'の説明',
    'あなたはテンプレート' || s::text || 'の口調で回答するアシスタントです。'
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 6) AS s
ON CONFLICT (id) DO NOTHING;

INSERT INTO groups_prompt_templates (group_id, prompt_template_id, tenant_id)
SELECT
    md5(t.tenant_id || '-group-' || ((s - 1) % 4 + 1)::text),
    md5(t.tenant_id || '-prompt-' || s::text),
    t.tenant_id
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 5) AS s
ON CONFLICT (group_id, prompt_template_id, tenant_id) DO NOTHING;

-- 各テナントに1つAzure OpenAIエンドポイント (ダミー)
INSERT INTO tenant_endpoints (id, tenant_id, type, endpoint_name, endpoint, api_key)
SELECT
    md5(t.tenant_id || '-endpoint-azure'),
    t.tenant_id,
    'AZURE_OPENAI_CHAT',
    t.tenant_id || ' Azure OpenAI (デモ用)',
    'https://example.openai.azure.com',
    'dummy-api-key-for-seed-' || t.tenant_id
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
ON CONFLICT (id) DO NOTHING;

-- 全アシスタントをこのエンドポイントに紐付ける
INSERT INTO assistants_endpoints (assistant_id, endpoint_id, tenant_id, model)
SELECT
    md5(t.tenant_id || '-assistant-' || s::text),
    md5(t.tenant_id || '-endpoint-azure'),
    t.tenant_id,
    'gpt-4o'
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
CROSS JOIN generate_series(1, 6) AS s
ON CONFLICT (assistant_id, endpoint_id) DO NOTHING;

-- 各テナントに12ルーム (ユーザー1〜12番を所有者に、アシスタントを順繰りに割り当て)
INSERT INTO rooms (id, tenant_id, name, default_assistant_id, user_id, rating)
SELECT
    md5(u.tenant_id || '-room-' || rn::text),
    u.tenant_id,
    u.tenant_id || ' ルーム' || rn::text,
    md5(u.tenant_id || '-assistant-' || ((rn - 1) % 6 + 1)::text),
    u.id,
    (ARRAY['EXCELLENT', 'VERY_GOOD', 'GOOD', 'AVERAGE', 'POOR'])[((rn - 1) % 5) + 1]::roomrating
FROM (
    SELECT
        id, tenant_id,
        row_number() OVER (PARTITION BY tenant_id ORDER BY login_id) AS rn
    FROM users
    WHERE tenant_id IN ('tenant-demo-a', 'tenant-demo-b')
) u
WHERE rn <= 12
ON CONFLICT (id) DO NOTHING;

-- ルームごとに1メッセージ
INSERT INTO messages (id, tenant_id, room_id, assistant_id)
SELECT
    md5(r.tenant_id || '-message-' || r.id),
    r.tenant_id,
    r.id,
    r.default_assistant_id
FROM rooms r
WHERE r.tenant_id IN ('tenant-demo-a', 'tenant-demo-b')
ON CONFLICT (id) DO NOTHING;

-- メッセージの半数にフィードバックを付ける (GOOD/BADを交互に)
INSERT INTO message_feedbacks (id, tenant_id, user_id, message_id, rating, index_id)
SELECT
    md5(sub.tenant_id || '-feedback-' || sub.id),
    sub.tenant_id,
    sub.user_id,
    sub.id,
    (CASE WHEN sub.rn % 2 = 0 THEN 'BAD' ELSE 'GOOD' END)::messagerating,
    NULL
FROM (
    SELECT
        m.id, m.tenant_id, r.user_id,
        row_number() OVER (PARTITION BY m.tenant_id ORDER BY m.id) AS rn
    FROM messages m
    JOIN rooms r ON r.id = m.room_id AND r.tenant_id = m.tenant_id
    WHERE m.tenant_id IN ('tenant-demo-a', 'tenant-demo-b')
) sub
WHERE sub.rn <= 6
ON CONFLICT (message_id) DO NOTHING;

-- 各テナントにプラン・有効なサブスクリプション (クレジット利用状況ダッシュボードAPI用)
INSERT INTO plans (id, name, max_users, max_credits_per_month)
VALUES ('plan-demo', 'Demo', 20, 50000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (id, tenant_id, plan_id, status, start_date)
SELECT
    'subscription-' || t.tenant_id,
    t.tenant_id,
    'plan-demo',
    'ACTIVE',
    date_trunc('month', CURRENT_DATE)
FROM (VALUES ('tenant-demo-a'), ('tenant-demo-b')) AS t(tenant_id)
ON CONFLICT (id) DO NOTHING;
