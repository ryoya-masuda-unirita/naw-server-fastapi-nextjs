import { test, expect } from './fixtures/auth.fixture';

// 04_ログアウト.md 対応。
// 項番8/9（Chrome/Edge両ブラウザでの確認）はplaywright.config.tsのchromiumプロジェクト実行を
// もって代表させ、ブラウザ別の個別テストケースは作らない（Edge固有の検証観点がないため）。

test.describe('ログアウト', () => {
  test('ログアウト確認ダイアログが表示されること', async ({ authenticatedPage: page }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await expect(page.getByText('ログアウトします')).toBeVisible();
    await expect(
      page.getByText('ログアウトすると、現在のセッションが終了します。再度ログインが必要になります。'),
    ).toBeVisible();
  });

  test('ログアウトを実行するとログイン画面に遷移すること', async ({ authenticatedPage: page }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await page.getByRole('button', { name: 'ログアウト' }).last().click();
    await page.waitForURL('/auth/login');
  });

  test('キャンセルするとダイアログが閉じ認証後画面に留まること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await expect(page.getByText('ログアウトします')).toBeVisible();

    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByText('ログアウトします')).not.toBeVisible();
    await expect(page).toHaveURL('/dashboard');
  });

  test('ログアウト後に保護ルートへ直接アクセスするとログイン画面にリダイレクトされること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await page.getByRole('button', { name: 'ログアウト' }).last().click();
    await page.waitForURL('/auth/login');

    await page.goto('/dashboard');
    await page.waitForURL('/auth/login');
  });

  test('ログアウト後に有効な認証情報で再ログインできること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await page.getByRole('button', { name: 'ログアウト' }).last().click();
    await page.waitForURL('/auth/login');

    await page.getByPlaceholder('ユーザーID').fill('user01');
    await page.getByPlaceholder('パスワード').fill('user01@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/dashboard');
  });

  test('ログアウト後にブラウザの戻るボタンを押しても保護画面にアクセスできないこと', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('ユーザー1').click();
    await page.getByText('ログアウト', { exact: true }).click();
    await page.getByRole('button', { name: 'ログアウト' }).last().click();
    await page.waitForURL('/auth/login');

    await page.goBack();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('管理者ユーザーもログアウトできること', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('ユーザーID').fill('admin');
    await page.getByPlaceholder('パスワード').fill('admin@1234');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/dashboard');

    await page.getByText('管理者', { exact: true }).click();
    await page.getByText('ログアウト', { exact: true }).click();
    await page.getByRole('button', { name: 'ログアウト' }).last().click();
    await page.waitForURL('/auth/login');
  });
});
