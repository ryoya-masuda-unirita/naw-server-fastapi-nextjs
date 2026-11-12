-- クラウド側 backend に、社内側（onprem/docker-compose.yml）の server-local を使う SECURE アシスタントを登録する。
-- backend/seed.sql（test-tenant・動作確認用グループ）を流した後に流す。
-- endpoint・api_key は onprem/docker-compose.yml の server-local の公開ポートと認証キー（既定値）に合わせる

INSERT INTO assistants (id, tenant_id, type, name, description, include_history)
VALUES (
    '10000000000040008000000000000301',
    'test-tenant',
    'SECURE',
    '社内アシスタント（オンプレ）',
    'onprem/ の server-local に質問を送るアシスタント',
    true
)
ON CONFLICT (id) DO NOTHING;

-- ブラウザはこの URL に api/messages/content を付けて server-local に直接送る
INSERT INTO tenant_endpoints (id, tenant_id, type, endpoint_name, endpoint, api_key)
VALUES (
    '30000000000040008000000000000301',
    'test-tenant',
    'LOCAL_SERVER',
    'server-local（オンプレ）',
    'http://localhost:18090/',
    'onprem-local-key'
)
ON CONFLICT (id) DO NOTHING;

-- model はブラウザが textData.assistantId に入れ、server-local が Waha! のサービス ID として使う
INSERT INTO assistants_endpoints (assistant_id, endpoint_id, tenant_id, model)
VALUES (
    '10000000000040008000000000000301',
    '30000000000040008000000000000301',
    'test-tenant',
    'onprem-chat'
)
ON CONFLICT (assistant_id, endpoint_id) DO NOTHING;

INSERT INTO groups_assistants (group_id, assistant_id, tenant_id)
VALUES (
    '20000000000040008000000000000001',
    '10000000000040008000000000000301',
    'test-tenant'
)
ON CONFLICT (group_id, assistant_id, tenant_id) DO NOTHING;
