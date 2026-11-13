/**
 * テストで使うログイン用ユーザー。backend/seed.sql・backend/seed-demo.sql と e2e-spec/docker/spec-seed.sql の値。
 * 権限別に 1 人ずつ。パスワードを変える・ロックされる・削除されるテストには使わず、テスト用に作ったユーザーを使う（fixtures の createUser）。
 */

export type RoleName = 'system' | 'tenantAdmin' | 'user' | 'groupAdmin';

export interface SeedUser {
  tenantId: string;
  loginId: string;
  password: string;
  /** backend の users.role。 */
  role: 'SYSTEM' | 'ADMIN' | 'USER';
  /** 画面に出る名前。 */
  name: string;
  description: string;
}

export const TENANT_ID = 'test-tenant';

export const USERS: Record<RoleName, SeedUser> = {
  system: {
    tenantId: TENANT_ID,
    loginId: 'system-admin',
    password: 'admin@1234',
    role: 'SYSTEM',
    name: 'システム管理者',
    description: 'システム管理者（spec-seed.sql で追加）',
  },
  tenantAdmin: {
    tenantId: TENANT_ID,
    loginId: 'admin',
    password: 'admin@1234',
    role: 'ADMIN',
    name: '管理者',
    description: 'テナント管理者',
  },
  user: {
    tenantId: TENANT_ID,
    loginId: 'user01',
    password: 'user01@1234',
    role: 'USER',
    name: 'ユーザー1',
    description: '一般ユーザー',
  },
  groupAdmin: {
    tenantId: TENANT_ID,
    loginId: 'tanaka',
    password: 'admin@1234',
    role: 'USER',
    name: '田中 太郎',
    description: 'グループ管理者（seed-demo.sql の「営業部」の管理者）',
  },
};

/** 初回ログイン（パスワード設定が必要）のユーザー。 */
export const FIRST_LOGIN_USER: SeedUser = {
  tenantId: TENANT_ID,
  loginId: 'first-login-user',
  password: 'firstlogin@1234',
  role: 'USER',
  name: '初回ログインユーザー',
  description: '初回ログイン（is_required_password_reset = true）',
};

/** パスワードの期限が切れたユーザー。 */
export const EXPIRED_PASSWORD_USER: SeedUser = {
  tenantId: TENANT_ID,
  loginId: 'expired-password-user',
  password: 'expired@1234',
  role: 'USER',
  name: '期限切れユーザー',
  description: 'パスワードの期限切れ',
};
