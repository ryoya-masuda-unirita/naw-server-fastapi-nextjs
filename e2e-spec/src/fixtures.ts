import { test as base, type APIRequestContext, type Page } from '@playwright/test';
import {
  createUser as createUserViaApi,
  deleteUser,
  loginAsTenantAdmin,
  type CreatedUser,
  type CreateUserOptions,
} from './api.ts';
import { LoginPage } from './pages/login.page.ts';
import { TENANT_ID, USERS, type RoleName, type SeedUser } from './users.ts';

/**
 * 全カテゴリ共通の fixture。テストファイルは `@playwright/test` ではなく、ここから test / expect を import する。
 *
 *   loginPage        ログイン画面の Page Object
 *   loginAs(role)    画面からログインして、ログイン後の画面まで進める（権限別。seed のユーザー）
 *   adminApi         テナント管理者でログイン済みの API（テストデータの準備用）
 *   createUser(opts) テスト専用のユーザーを API で作る（終了時に自動で削除）。パスワード変更・ロック・削除をするテストはこれを使う
 *   uniqueId(prefix) 他のテストと衝突しない ID
 */

export { expect } from '@playwright/test';

export interface Fixtures {
  loginPage: LoginPage;
  loginAs: (role: RoleName) => Promise<SeedUser>;
  adminApi: APIRequestContext;
  createUser: (options: Omit<CreateUserOptions, 'loginId'> & { loginId?: string }) => Promise<CreatedUser>;
  uniqueId: (prefix?: string) => string;
}

/** ユーザー ID の最大長（項目書 03-16: 50 文字）に収まるよう、接頭辞は短くする。 */
const UNIQUE_SUFFIX_LENGTH = 8;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 2 + UNIQUE_SUFFIX_LENGTH).padEnd(UNIQUE_SUFFIX_LENGTH, '0');
}

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }: { page: Page }, use) => {
    await use(new LoginPage(page));
  },

  loginAs: async ({ loginPage }, use) => {
    await use(async (role) => {
      const user = USERS[role];
      await loginPage.login(user);
      return user;
    });
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright は fixture の第 1 引数を分割代入で受ける必要がある
  adminApi: async ({}, use) => {
    const api = await loginAsTenantAdmin(TENANT_ID);
    try {
      await use(api);
    } finally {
      await api.dispose();
    }
  },

  // eslint-disable-next-line no-empty-pattern -- 同上
  uniqueId: async ({}, use) => {
    await use((prefix = 'spec') => `${prefix}-${randomSuffix()}`);
  },

  createUser: async ({ adminApi, uniqueId }, use) => {
    const created: CreatedUser[] = [];
    await use(async (options) => {
      const user = await createUserViaApi(adminApi, { ...options, loginId: options.loginId ?? uniqueId('spec') });
      created.push(user);
      return user;
    });
    // 後片付け。作ったユーザーを消す（テストの中で消していても 404 は無視する）
    for (const user of created) await deleteUser(adminApi, user);
  },
});
