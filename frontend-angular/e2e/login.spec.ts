import { test, expect } from './fixtures/auth.fixture';

test.describe('ログイン画面', () => {
  test('ログイン画面が表示されること', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByPlaceholder('テナントID')).toBeVisible();
    await expect(page.getByPlaceholder('ユーザーID')).toBeVisible();
    await expect(page.getByPlaceholder('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
  });

  test('正常な認証情報でログインできること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('user01');
    await page.getByPlaceholder('パスワード').fill('user01@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/dashboard');
  });

  test('ユーザーID未入力の場合エラーが表示されること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('パスワード').fill('user01@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('この項目は必須です').first()).toBeVisible();
  });

  test('パスワード未入力の場合エラーが表示されること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('user01');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('この項目は必須です').first()).toBeVisible();
  });

  test('全項目未入力の場合エラーが表示されること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('この項目は必須です')).toHaveCount(3);
  });

  test('存在しないユーザーIDでログインが失敗すること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('nonexistent-user');
    await page.getByPlaceholder('パスワード').fill('user01@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('ユーザIDかパスワードが間違っています').first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('誤ったパスワードでログインが失敗すること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('user01');
    await page.getByPlaceholder('パスワード').fill('WrongPassword123');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('ユーザIDかパスワードが間違っています').first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('パスワード表示切替ボタンが機能すること', async ({ page }) => {
    await page.goto('/auth/login');
    const passwordInput = page.getByPlaceholder('パスワード');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('フッターの利用規約・プライバシーポリシーリンクが表示されること', async ({ page }) => {
    await page.goto('/auth/login');
    const termsLink = page.getByRole('link', { name: /利用規約/ });
    const privacyLink = page.getByRole('link', { name: /プライバシー/ });
    await expect(termsLink).toBeVisible();
    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', /.+/);
    await expect(privacyLink).toHaveAttribute('href', /.+/);
  });
});

test.describe('初回ログイン・パスワード期限切れ', () => {
  test('初回ログインアカウントはパスワード設定画面に遷移すること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('first-login-user');
    await page.getByPlaceholder('パスワード').fill('firstlogin@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/auth/password/reset');
  });

  test('パスワード期限切れアカウントはパスワード設定画面に遷移すること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('テナントID').fill('test-tenant');
    await page.getByPlaceholder('ユーザーID').fill('expired-password-user');
    await page.getByPlaceholder('パスワード').fill('expired@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/auth/password/reset');
  });
});

test.describe('認証後の画面遷移', () => {
  // 既知の不具合: no-auth.guard.ts が authStore.ensureInitialized() を待たずに
  // isAuthenticated() を判定しているため、ページリロード直後（sessionStorageからの
  // 認証状態復元前）は「未認証」と誤判定され、ログイン済みでも/auth/loginがそのまま
  // 表示されてしまう（/dashboardにリダイレクトされない）。
  // 本Issue(#163)はE2E基盤構築が目的のためアプリ側の修正は行わず、事象の記録として
  // テストをskipする。修正は別Issueで対応する。
  test.skip('ログイン後に/auth/loginへ直接アクセスするとダッシュボードにリダイレクトされること', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/auth/login');
    await authenticatedPage.waitForURL('/dashboard');
  });
});
