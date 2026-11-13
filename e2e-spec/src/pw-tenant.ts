import { randomBytes } from 'node:crypto';
import { psql, sqlLiteral } from './psql.ts';
import { USERS } from './users.ts';

/**
 * パスワードポリシー専用のテナント（05_パスワード再設定の 16〜18・23〜38 用）。
 * test-tenant のポリシーを書き換えると、並列で動く他のテストに響くため、テストごとに別のテナントを SQL で作り、終わったら消す。
 * ユーザーは「初期パスワードのまま」（ログインするとパスワード設定画面へ進む）で、初期パスワードは user01 と同じ。
 */

export interface PolicyTenantOptions {
  minLength: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export interface PolicyTenant {
  tenantId: string;
  loginId: string;
  /** 初期パスワード（ログイン後にパスワード設定画面で「旧パスワード」に入れる）。 */
  password: string;
}

/** 記号の許可文字（backend の既定値と同じ）。 */
export const VALID_SYMBOLS = '!@#$%^&*';
const TENANT_ID_SUFFIX_BYTES = 6;
const POLICY_USER_ID = 'policy-user';

/**
 * ポリシー専用のテナントとユーザーを作る。
 *
 * @param options パスワードポリシー
 * @returns 作ったテナント・ユーザー
 */
export function createPolicyTenant(options: PolicyTenantOptions): PolicyTenant {
  const tenantId = `spec-pw-${randomBytes(TENANT_ID_SUFFIX_BYTES).toString('hex')}`;
  const seed = USERS.user;
  psql(`
    INSERT INTO tenants (id, name, owner, pw_policy_min_length, pw_policy_use_uppercase, pw_policy_use_lowercase,
                         pw_policy_use_digits, pw_policy_use_symbols, pw_policy_valid_symbols)
    VALUES (${sqlLiteral(tenantId)}, 'ポリシー確認', ${sqlLiteral(POLICY_USER_ID)}, ${options.minLength},
            ${options.uppercase}, ${options.lowercase}, ${options.digits}, ${options.symbols}, ${sqlLiteral(VALID_SYMBOLS)});
    INSERT INTO users (login_id, tenant_id, name, role, is_required_password_reset)
    VALUES (${sqlLiteral(POLICY_USER_ID)}, ${sqlLiteral(tenantId)}, 'ポリシー確認ユーザー', 'USER', true);
    INSERT INTO password_histories (tenant_id, user_id, password)
    SELECT ${sqlLiteral(tenantId)}, u.id, h.password
    FROM users u,
         (SELECT ph.password FROM password_histories ph JOIN users su ON su.id = ph.user_id
           WHERE su.login_id = ${sqlLiteral(seed.loginId)} AND su.tenant_id = ${sqlLiteral(seed.tenantId)}
           ORDER BY ph.created_at DESC LIMIT 1) h
    WHERE u.login_id = ${sqlLiteral(POLICY_USER_ID)} AND u.tenant_id = ${sqlLiteral(tenantId)};
  `);
  return { tenantId, loginId: POLICY_USER_ID, password: seed.password };
}

/**
 * ポリシー専用のテナントを消す（ユーザー・パスワード履歴ごと）。
 *
 * @param tenant 作ったテナント
 */
export function deletePolicyTenant(tenant: Pick<PolicyTenant, 'tenantId'>): void {
  psql(`
    DELETE FROM users WHERE tenant_id = ${sqlLiteral(tenant.tenantId)};
    DELETE FROM tenants WHERE id = ${sqlLiteral(tenant.tenantId)};
  `);
}
