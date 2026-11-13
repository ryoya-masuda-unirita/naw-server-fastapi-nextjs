import type { ExplorerConfig, Shard } from './config.ts';

/**
 * 担当範囲ごとの専用テナントを作る SQL。
 * seed のテナント（sourceTenantId）の設定を写したテナントを作り、権限の設定にある
 * ユーザー（ログイン ID・パスワードとも seed と同じ）を写す。何度流しても重複しない。
 *
 * 列を書き並べず `SELECT *` で写すのは、tenants に列が増えても（既定値のある列なら）
 * この SQL を直さずに済むようにするため。
 */

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** テナントとログイン ID から毎回同じユーザー ID を作る（再実行しても同じ行を指すため）。 */
function userIdExpr(tenantId: string, loginId: string): string {
  return `md5(${literal(`${tenantId}:${loginId}`)})::uuid`;
}

export interface TenantPlan {
  tenantId: string;
  sourceTenantId: string;
  loginIds: string[];
}

/** 担当範囲から、作るテナントと写すユーザーを決める。テナントが同じ担当範囲はまとめる。 */
export function planTenants(config: ExplorerConfig, shards: Shard[]): TenantPlan[] {
  const loginRoles = Object.values(config.roles).filter((r) => !r.anonymous && r.loginId);
  const plans = new Map<string, TenantPlan>();
  for (const shard of shards) {
    if (!shard.tenantId || shard.roleConfig.anonymous) continue;
    const sourceTenantId = shard.roleConfig.sourceTenantId as string;
    // 写す元と同じテナントを使う設定（tenants.perShard: false）なら作らない
    if (shard.tenantId === sourceTenantId) continue;
    if (plans.has(shard.tenantId)) continue;
    // 管理画面で他のユーザーが見えるよう、ログインする権限のユーザーは全員写す
    const loginIds = loginRoles.filter((r) => r.sourceTenantId === sourceTenantId).map((r) => r.loginId as string);
    plans.set(shard.tenantId, { tenantId: shard.tenantId, sourceTenantId, loginIds });
  }
  return [...plans.values()];
}

export function buildTenantSql(plans: TenantPlan[]): string {
  const lines: string[] = ['\\set ON_ERROR_STOP on', 'BEGIN;'];
  for (const plan of plans) {
    const tenant = literal(plan.tenantId);
    const source = literal(plan.sourceTenantId);
    lines.push(
      `-- 担当範囲のテナント ${plan.tenantId}（写す元: ${plan.sourceTenantId}）`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = ${source}) THEN ` +
        `RAISE EXCEPTION '写す元のテナント % がありません（seed を入れたか確かめてください）', ${source}; END IF; END $$;`,
      `CREATE TEMP TABLE e2e_tenant ON COMMIT DROP AS SELECT * FROM tenants WHERE id = ${source};`,
      `UPDATE e2e_tenant SET id = ${tenant}, name = left(${literal(`E2E ${plan.tenantId}`)}, 32);`,
      'INSERT INTO tenants SELECT * FROM e2e_tenant ON CONFLICT (id) DO NOTHING;',
      'DROP TABLE e2e_tenant;'
    );
    for (const loginId of plan.loginIds) {
      const login = literal(loginId);
      const userId = userIdExpr(plan.tenantId, loginId);
      lines.push(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM users WHERE tenant_id = ${source} AND login_id = ${login}) THEN ` +
          `RAISE EXCEPTION '写す元のユーザー % がテナント % にありません', ${login}, ${source}; END IF; END $$;`,
        'INSERT INTO users (id, login_id, tenant_id, name, role, is_required_password_reset)',
        `SELECT ${userId}, u.login_id, ${tenant}, u.name, u.role, false FROM users u`,
        `WHERE u.tenant_id = ${source} AND u.login_id = ${login}`,
        'ON CONFLICT (login_id, tenant_id) DO NOTHING;',
        'INSERT INTO password_histories (tenant_id, user_id, password)',
        `SELECT ${tenant}, ${userId}, ph.password FROM password_histories ph JOIN users u ON u.id = ph.user_id`,
        `WHERE u.tenant_id = ${source} AND u.login_id = ${login}`,
        `AND NOT EXISTS (SELECT 1 FROM password_histories x WHERE x.user_id = ${userId})`,
        'ORDER BY ph.created_at DESC LIMIT 1;'
      );
    }
  }
  lines.push('COMMIT;');
  return `${lines.join('\n')}\n`;
}
