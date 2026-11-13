import { getSessionUser } from '../src/api.ts';
import { expect, test } from '../src/fixtures.ts';
import { DASHBOARD_PATH, LOGIN_PATH } from '../src/pages/login.page.ts';
import { SidebarPage, SIDEBAR_MESSAGES } from '../src/pages/sidebar.page.ts';

/**
 * 04_ログアウト（10 項目）。項目書: 25DA61_結合テスト項目書_md/04_ログアウト.md
 *
 * 移植元との対応:
 * - 項番 9「ログアウト Edge」は、Playwright の Chromium（Edge と同じエンジン）で確かめる。Edge 本体ではない
 * - 項番 8「ログアウト Chrome」も同じく Playwright の Chromium で確かめる
 */

const LOGIN_URL = new RegExp(LOGIN_PATH);

test.describe('04_ログアウト', () => {
  test('[04-01] ログアウト確認ダイアログ表示', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.selectUserMenu('logout');
    await expect(sidebar.dialog).toBeVisible();
    await expect(sidebar.dialog.getByText(SIDEBAR_MESSAGES.logoutConfirmTitle)).toBeVisible();
    await expect(sidebar.logoutConfirmButton).toBeVisible();
    await expect(sidebar.logoutCancelButton).toBeVisible();
  });

  test('[04-02] ログアウト実行', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('[04-03] ログアウトキャンセル', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.selectUserMenu('logout');
    await sidebar.logoutCancelButton.click();
    await expect(sidebar.dialog).toBeHidden();
    await expect(page).not.toHaveURL(LOGIN_URL);
    await sidebar.expectLayout();
  });

  test('[04-04] ログアウト後の保護ルートアクセス', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    await page.goto(DASHBOARD_PATH);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('[04-05] ログアウト後の再ログイン', async ({ loginPage, page, createUser }) => {
    // 再ログインの確認で他のテストのセッションに響かないよう、このテスト専用のユーザーを使う
    const user = await createUser({});
    await loginPage.login(user);
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    await loginPage.login(user);
    await sidebar.expectLayout();
  });

  test('[04-06] 一般ユーザーログアウト', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    expect(await getSessionUser(page.request)).toBeNull();
  });

  test('[04-07] 管理者ログアウト', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    expect(await getSessionUser(page.request)).toBeNull();
  });

  test('[04-08] ログアウト Chrome', async ({ loginAs, page, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await loginAs('user');
    await new SidebarPage(page).logout();
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('[04-09] ログアウト Edge', async ({ loginAs, page, browserName }) => {
    // Edge は Chromium ベースのため、Playwright の Chromium で確かめる。Edge 本体（channel: msedge）ではない
    expect(browserName).toBe('chromium');
    await loginAs('user');
    await new SidebarPage(page).logout();
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('[04-10] ログアウト後ブラウザ戻る', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    await page.goBack();
    // 保護画面にはアクセスできず、ログイン画面等に留まる
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(sidebar.aside).toBeHidden();
  });
});
