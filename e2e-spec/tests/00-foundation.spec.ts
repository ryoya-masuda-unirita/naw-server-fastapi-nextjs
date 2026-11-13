import { loginApi } from '../src/api.ts';
import { expect, test } from '../src/fixtures.ts';
import { LOGIN_PATH } from '../src/pages/login.page.ts';
import { USERS, type RoleName } from '../src/users.ts';

/**
 * 土台の動作確認。項目書の項番は付けない（集計の対象外）。
 * 権限別のログインユーザーが専用環境の seed に入っていて、API・画面の両方でログインできることを確かめる。
 */

const ROLE_NAMES: RoleName[] = ['system', 'tenantAdmin', 'user', 'groupAdmin'];

test.describe('土台: 権限別のログインユーザー', () => {
  for (const role of ROLE_NAMES) {
    test(`${role} で API ログインでき、権限が seed の定義と一致する`, async () => {
      const user = USERS[role];
      const api = await loginApi(user);
      try {
        const res = await api.get('/api/auth');
        expect(res.ok()).toBe(true);
        const body = (await res.json()) as { id: string; role: string };
        expect(body.id).toBe(user.loginId);
        expect(body.role).toBe(user.role);
      } finally {
        await api.dispose();
      }
    });

    test(`${role} で画面からログインできる`, async ({ loginAs, page }) => {
      await loginAs(role);
      await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
    });
  }
});
