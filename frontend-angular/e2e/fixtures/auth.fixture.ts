import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('user01');
    await page.getByPlaceholder('パスワード').fill('user01@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  },
});

export { expect };
