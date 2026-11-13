import { spawnSync } from 'node:child_process';
import { COMPOSE_PROJECT_NAME } from './env.ts';

/**
 * 17_学習データの「ファイル追加-プラン制限」の項目（38〜47）用に、専用環境の DB へ直接 SQL を流して
 * 「プランのクレジット上限・テナントの従量課金上限・今月の利用クレジット」を決めたテナントを作る・消すヘルパー。
 *
 * test-tenant の契約や利用量を書き換えると、並列で動く他のテストのファイル追加が拒否されてしまうため、
 * テストごとに専用のテナント（seed の管理者のパスワードを引き継いだ管理者つき）を作る。専用環境の DB コンテナにだけ触る。
 */

export class DbError extends Error {}

const SEED_TENANT_ID = 'test-tenant';
export const QUOTA_ADMIN_LOGIN_ID = 'admin';
/** seed の管理者のパスワード（パスワード履歴ごとコピーするので同じ）。 */
export const QUOTA_ADMIN_PASSWORD = 'admin@1234';
const ID_SUFFIX_LENGTH = 8;

/** 専用環境の PostgreSQL に SQL を流す。 */
function psql(sql: string): void {
  const container = `${COMPOSE_PROJECT_NAME}-postgres-1`;
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'root', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf-8',
  });
  if (result.error) throw new DbError(`docker を実行できません: ${result.error.message}`);
  if (result.status !== 0) throw new DbError(`SQL が失敗しました: ${result.stderr}`);
}

export interface QuotaScenario {
  /** プランの月間クレジット上限（plans.max_credits_per_month）。 */
  planLimit: number;
  /** テナントごとの従量課金の上限（tenants.max_usage_based_credits_per_month）。0 ならプランの上限だけ。 */
  tenantLimit: number;
  /** 今月すでに使っているクレジット（token_usages の合計）。 */
  usedCredits: number;
}

export interface QuotaTenant {
  tenantId: string;
  planId: string;
  loginId: string;
  password: string;
  /** クラウドの学習先フォルダの接続先（ベクトル DB と埋め込みの 2 つで 1 組）。 */
  endpointIds: string[];
}

/**
 * 契約のクレジット上限と利用量を決めたテナントを作る。管理者（`admin`）つき。
 *
 * @param scenario プラン上限・テナント上限・今月の利用クレジット
 * @returns 作ったテナントの情報
 * @throws DbError SQL が失敗したとき
 */
export function createQuotaTenant(scenario: QuotaScenario): QuotaTenant {
  const suffix = Math.random().toString(36).slice(2, 2 + ID_SUFFIX_LENGTH).padEnd(ID_SUFFIX_LENGTH, '0');
  const tenantId = `quota-${suffix}`;
  const planId = `plan-${tenantId}`;
  const endpointIds = [`${tenantId}-vdb`, `${tenantId}-emb`];
  psql(`
BEGIN;
INSERT INTO plans (id, name, max_users, max_credits_per_month) VALUES ('${planId}', 'e2e-quota', 10, ${scenario.planLimit});
INSERT INTO tenants (id, name, owner, max_usage_based_credits_per_month) VALUES ('${tenantId}', 'e2e-quota', 'e2e', ${scenario.tenantLimit});
INSERT INTO subscriptions (id, tenant_id, plan_id, status, start_date)
  VALUES ('sub-${tenantId}', '${tenantId}', '${planId}', 'ACTIVE', date_trunc('month', CURRENT_DATE));
INSERT INTO users (login_id, tenant_id, name, role, is_required_password_reset)
  VALUES ('${QUOTA_ADMIN_LOGIN_ID}', '${tenantId}', '管理者', 'ADMIN', false);
INSERT INTO password_histories (tenant_id, user_id, password, expired_at)
  SELECT '${tenantId}', (SELECT id FROM users WHERE tenant_id = '${tenantId}' AND login_id = '${QUOTA_ADMIN_LOGIN_ID}'), ph.password, ph.expired_at
  FROM password_histories ph
  WHERE ph.user_id = (SELECT id FROM users WHERE tenant_id = '${SEED_TENANT_ID}' AND login_id = '${QUOTA_ADMIN_LOGIN_ID}')
  ORDER BY ph.created_at DESC LIMIT 1;
INSERT INTO tenant_endpoints (id, tenant_id, type, endpoint_name, endpoint, api_key) VALUES
  ('${endpointIds[0]}', '${tenantId}', 'VDB', 'quota VDB', 'https://vdb.example.com', 'dummy'),
  ('${endpointIds[1]}', '${tenantId}', 'AZURE_OPENAI_EMBEDDING', 'quota Embedding', 'https://embedding.example.com', 'dummy');
INSERT INTO token_usages (id, tenant_id, model, input_credits) VALUES ('${tenantId}-usage', '${tenantId}', 'gpt-4o', ${scenario.usedCredits});
COMMIT;
`);
  return { tenantId, planId, loginId: QUOTA_ADMIN_LOGIN_ID, password: QUOTA_ADMIN_PASSWORD, endpointIds };
}

/**
 * `createQuotaTenant` で作ったテナントとプランを消す（後片付け）。
 *
 * @param tenant 消すテナント
 * @throws DbError SQL が失敗したとき
 */
export function dropQuotaTenant(tenant: Pick<QuotaTenant, 'tenantId' | 'planId'>): void {
  psql(`
BEGIN;
DELETE FROM password_histories WHERE tenant_id = '${tenant.tenantId}';
DELETE FROM tenants WHERE id = '${tenant.tenantId}';
DELETE FROM plans WHERE id = '${tenant.planId}';
COMMIT;
`);
}
