import type { Page } from '@playwright/test';
import { loginAsUser, createRoom } from '../src/api-rooms.ts';
import { expect, test } from '../src/fixtures.ts';
import { DASHBOARD_PATH, LOGIN_PATH } from '../src/pages/login.page.ts';
import { PW_RESET_PATH } from '../src/pages/password-reset.page.ts';
import { SIDEBAR_MESSAGES, SidebarPage } from '../src/pages/sidebar.page.ts';

/**
 * 06_レイアウト（29 項目）。項目書: 25DA61_結合テスト項目書_md/06_レイアウト.md
 *
 * 移植元との対応:
 * - 「管理者切替」は画面の文言では「管理者画面に切替」（USER_MENU.SWITCH_TO_ADMIN）。「クレジット確認」は「クレジット利用状況を確認」
 * - 「管理コンソール」は、管理者がユーザーメニューで管理者画面に切り替えたときのサイドバーの見出し（ADMIN_CONSOLE.MANAGEMENT_CONSOLE）。
 *   項番 3・16・21 はこの切替を通して確かめる
 * - 「用語辞書」「データソース」は、移植元でコメントアウトされた非表示の機能（layout.config.ts）のため、確かめない
 * - 項番 4 の「新しいチャット」は、移植元ではダイアログ（「新しいチャットを作成」）を開き、アシスタントを選んで作成するとそのルームへ移る
 * - 項番 9・18 のモバイル表示幅は 375x812 で確かめる
 * - 項番 19 の Chrome は Playwright の Chromium（Chrome と同じエンジン）
 */

const MOBILE_VIEWPORT = { width: 375, height: 812 };
/** サイドバーが折りたたまれたときの幅（w-13 = 52px）より大きい境界。 */
const COLLAPSED_WIDTH_LIMIT_PX = 80;
const APP_TITLE = 'SecuAiGent';
const NEW_CHAT_DIALOG_TITLE = '新しいチャットを作成';
const ADMIN_PATH_PREFIX = '/admin/';

/** 画面のレイアウトのまま、サイドバーの幅を取る。 */
async function sidebarWidth(sidebar: SidebarPage): Promise<number> {
  const box = await sidebar.aside.boundingBox();
  if (!box) throw new Error('サイドバーの位置を取得できません');
  return box.width;
}

/** モバイル幅で、サイドバーが画面の中に出ている（左端が 0 以上）か。 */
async function isSidebarOnScreen(sidebar: SidebarPage): Promise<boolean> {
  const box = await sidebar.aside.boundingBox();
  return box !== null && box.x >= 0;
}

/** モバイル幅のハンバーガー（チャット画面のヘッダー）でサイドバーを開く。 */
async function openMobileSidebar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'サイドバー切り替え' }).click();
}

test.describe('06_レイアウト', () => {
  test('[06-01] 基本レイアウト表示', async ({ loginAs, page }) => {
    await loginAs('user');
    await new SidebarPage(page).expectLayout();
  });

  test('[06-02] サイドバーメニュー表示（一般）', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    for (const text of [
      SIDEBAR_MESSAGES.newChat,
      SIDEBAR_MESSAGES.searchChat,
      SIDEBAR_MESSAGES.dataUtilization,
      SIDEBAR_MESSAGES.chat,
    ]) {
      await expect(sidebar.item(text), text).toBeVisible();
    }
  });

  test('[06-03] サイドバーメニュー表示（管理者）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    for (const text of [SIDEBAR_MESSAGES.newChat, SIDEBAR_MESSAGES.searchChat, SIDEBAR_MESSAGES.dataUtilization]) {
      await expect(sidebar.item(text), text).toBeVisible();
    }
    // 一般メニューに加え、管理者画面に切り替えると「管理コンソール」等が表示される
    await sidebar.selectUserMenu('switch-role');
    await expect(sidebar.item(SIDEBAR_MESSAGES.managementConsole)).toBeVisible();
  });

  test('[06-04] 新規チャット遷移', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.item(SIDEBAR_MESSAGES.newChat).click();
    await expect(sidebar.dialog.getByText(NEW_CHAT_DIALOG_TITLE)).toBeVisible();
    await sidebar.dialog.getByRole('button', { name: 'キャンセル' }).click();
    // 新規チャット画面（チャット入力欄のある画面）にいる
    await expect(page).toHaveURL(new RegExp(`${DASHBOARD_PATH}|/chat/new`));
    await expect(page.getByPlaceholder('@でアシスタントを指定できます')).toBeVisible();
  });

  test('[06-05] データ活用サブメニュー展開', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    const toggle = sidebar.aside.getByRole('button', { name: 'toggle-section-SIDEBAR.DATA_UTILIZATION' });
    // 折りたたんでから「データ活用」をクリックして展開する
    await sidebar.item(SIDEBAR_MESSAGES.dataUtilization).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await sidebar.item(SIDEBAR_MESSAGES.dataUtilization).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.item(SIDEBAR_MESSAGES.library)).toBeInViewport();
  });

  test('[06-06] ライブラリ遷移', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.item(SIDEBAR_MESSAGES.library).click();
    await expect(page).toHaveURL(/\/library/);
    await sidebar.expectLayout();
  });

  test('[06-07] サイドバー折りたたみ', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    const expandedSidebarWidth = await sidebarWidth(sidebar);
    const expandedMainWidth = (await sidebar.main.boundingBox())?.width ?? 0;
    await sidebar.toggleButton.click();
    await expect.poll(() => sidebarWidth(sidebar)).toBeLessThan(COLLAPSED_WIDTH_LIMIT_PX);
    expect(await sidebarWidth(sidebar)).toBeLessThan(expandedSidebarWidth);
    await expect.poll(async () => (await sidebar.main.boundingBox())?.width ?? 0).toBeGreaterThan(expandedMainWidth);
  });

  test('[06-08] サイドバー展開', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    const expandedSidebarWidth = await sidebarWidth(sidebar);
    await sidebar.toggleButton.click();
    await expect.poll(() => sidebarWidth(sidebar)).toBeLessThan(COLLAPSED_WIDTH_LIMIT_PX);
    await sidebar.toggleButton.click();
    await expect.poll(() => sidebarWidth(sidebar)).toBe(expandedSidebarWidth);
    await expect(sidebar.item(SIDEBAR_MESSAGES.newChat)).toBeVisible();
  });

  test('[06-09] モバイルサイドバー開閉', async ({ loginAs, page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    // 初期状態は閉じている
    await expect.poll(() => isSidebarOnScreen(sidebar)).toBe(false);
    await openMobileSidebar(page);
    await expect.poll(() => isSidebarOnScreen(sidebar)).toBe(true);
    await page.getByRole('button', { name: 'close-mobile-sidebar-button' }).click();
    await expect.poll(() => isSidebarOnScreen(sidebar)).toBe(false);
  });

  test('[06-10] ユーザーメニュー表示', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.openUserMenu();
    await expect(sidebar.userMenuItem('password')).toContainText(SIDEBAR_MESSAGES.passwordSettings);
    await expect(sidebar.userMenuItem('check-credit')).toContainText(SIDEBAR_MESSAGES.checkCredit);
    await expect(sidebar.userMenuItem('logout')).toContainText(SIDEBAR_MESSAGES.logout);
  });

  test('[06-11] 管理者切替メニュー（管理者）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    await sidebar.openUserMenu();
    await expect(sidebar.userMenuItem('switch-role')).toBeVisible();
    await expect(sidebar.userMenuItem('switch-role')).toContainText(SIDEBAR_MESSAGES.switchToAdmin);
  });

  test('[06-12] 管理者切替非表示（一般）', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.openUserMenu();
    await expect(sidebar.userMenuItem('logout')).toBeVisible();
    await expect(sidebar.userMenuItem('switch-role')).toBeHidden();
  });

  test('[06-13] パスワード設定遷移', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.selectUserMenu('password');
    await expect(page).toHaveURL(new RegExp(PW_RESET_PATH));
  });

  test('[06-14] クレジット確認ダイアログ', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    // 項目書の備考: 1 回目は「Not Found」のトーストが 4 つ出た。取得に失敗する API があればエラーが出る
    const failedApis: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/')) failedApis.push(`${r.status()} ${r.url()}`);
    });
    await sidebar.selectUserMenu('check-credit');
    await expect(sidebar.dialog).toBeVisible();
    await expect(sidebar.dialog.getByText('Not Found')).toHaveCount(0);
    await expect(page.getByText('Not Found')).toHaveCount(0);
    expect(failedApis, '利用状況の取得で失敗した API').toEqual([]);
  });

  test('[06-15] 既存チャット一覧表示', async ({ loginPage, page, createUser, uniqueId }) => {
    const user = await createUser({});
    const api = await loginAsUser(user);
    try {
      const names = [uniqueId('room'), uniqueId('room')];
      for (const name of names) await createRoom(api, name);
      await loginPage.login(user);
      const sidebar = new SidebarPage(page);
      await expect(sidebar.item(SIDEBAR_MESSAGES.chat)).toBeVisible();
      for (const name of names) await expect(sidebar.room(name)).toBeVisible();
    } finally {
      await api.dispose();
    }
  });

  test('[06-16] 管理コンソール遷移', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    await sidebar.selectUserMenu('switch-role');
    await expect(page).toHaveURL(new RegExp(ADMIN_PATH_PREFIX));
    await expect(sidebar.item(SIDEBAR_MESSAGES.managementConsole)).toBeVisible();
    await sidebar.expectLayout();
  });

  test('[06-17] 折りたたみ＋メニュー遷移', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await sidebar.toggleButton.click();
    await expect.poll(() => sidebarWidth(sidebar)).toBeLessThan(COLLAPSED_WIDTH_LIMIT_PX);
    // 折りたたみ状態でも、メニューの操作が反応する（ツールチップの title で探す）
    await sidebar.aside.getByTitle(SIDEBAR_MESSAGES.searchChat).click();
    await expect(sidebar.dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sidebar.dialog).toBeHidden();
    await sidebar.aside.getByTitle(SIDEBAR_MESSAGES.library).click();
    await expect(page).toHaveURL(/\/library/);
  });

  test('[06-18] モバイル＋各画面遷移', async ({ loginAs, page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    // チャット
    await expect(page.getByPlaceholder('@でアシスタントを指定できます')).toBeVisible();
    // ライブラリ
    await openMobileSidebar(page);
    await sidebar.item(SIDEBAR_MESSAGES.library).click();
    await expect(page).toHaveURL(/\/library/);
    await expect(sidebar.main).toBeVisible();
    // 管理
    await page.goto(DASHBOARD_PATH);
    await openMobileSidebar(page);
    await sidebar.selectUserMenu('switch-role');
    await expect(page).toHaveURL(new RegExp(ADMIN_PATH_PREFIX));
    await expect(sidebar.main).toBeVisible();
  });

  test('[06-19] レイアウト表示 Chrome', async ({ loginAs, page, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await loginAs('user');
    await new SidebarPage(page).expectLayout();
  });

  test('[06-20] 一般ユーザーメニュー構成', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    // サイドバーに管理系のメニューが出ない
    await expect(sidebar.item(SIDEBAR_MESSAGES.managementConsole)).toHaveCount(0);
    await expect(sidebar.aside.getByText('ワークスペース設定')).toHaveCount(0);
    await sidebar.openUserMenu();
    await expect(sidebar.userMenuItem('switch-role')).toBeHidden();
  });

  test('[06-21] 管理者メニュー構成', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const sidebar = new SidebarPage(page);
    await sidebar.selectUserMenu('switch-role');
    await expect(sidebar.item(SIDEBAR_MESSAGES.managementConsole)).toBeVisible();
    await expect(sidebar.item('ワークスペース設定')).toBeVisible();
    await expect(sidebar.item('ユーザー管理')).toBeVisible();
    await expect(sidebar.item('チーム管理')).toBeVisible();
  });

  test('[06-22] 外部サービスRanabase表示', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    await expect(sidebar.item(SIDEBAR_MESSAGES.externalServices)).toBeVisible();
    await expect(sidebar.aside.getByRole('button', { name: SIDEBAR_MESSAGES.ranabase })).toBeVisible();
  });

  test('[06-23] チャット検索ボタン表示', async ({ loginAs, page }) => {
    await loginAs('user');
    await expect(page.getByTestId('chat-search-button')).toBeVisible();
    await expect(page.getByTestId('chat-search-button')).toContainText(SIDEBAR_MESSAGES.searchChat);
  });

  test('[06-24] サイドバーヘッダー表示', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    const logo = sidebar.aside.getByRole('img', { name: APP_TITLE });
    await expect(logo).toBeVisible();
    // 画像が実際に読み込めている
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(sidebar.toggleButton).toBeVisible();
  });

  test('[06-25] メイン領域スクロール', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    // 長いコンテンツ画面としてライブラリ一覧を使い、メイン領域のスクロール可否（overflow）を確かめる。
    // スクロール領域が画面を越えて伸びず、ページ全体にスクロールバーが出ないこと
    await sidebar.item(SIDEBAR_MESSAGES.library).click();
    await expect(page).toHaveURL(/\/library/);
    const overflows = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(overflows, 'ページ全体がスクロールしてしまう').toBe(false);
  });

  test('[06-26] データ活用折りたたみ', async ({ loginAs, page }) => {
    await loginAs('user');
    const sidebar = new SidebarPage(page);
    const toggle = sidebar.aside.getByRole('button', { name: 'toggle-section-SIDEBAR.DATA_UTILIZATION' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.item(SIDEBAR_MESSAGES.library)).toBeInViewport();
    await sidebar.item(SIDEBAR_MESSAGES.dataUtilization).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.item(SIDEBAR_MESSAGES.library)).not.toBeInViewport();
    await sidebar.item(SIDEBAR_MESSAGES.dataUtilization).click();
    await expect(sidebar.item(SIDEBAR_MESSAGES.library)).toBeInViewport();
  });

  test('[06-27] 未認証時ダッシュボード直アクセス', async ({ page }) => {
    await page.goto(DASHBOARD_PATH);
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[06-28] 一般ユーザー管理画面直アクセス', async ({ loginAs, page }) => {
    await loginAs('user');
    await page.goto('/admin/users');
    // アクセスが拒否される（管理画面が表示されない。項目書の備考: 画面が真っ白になるのは NG）
    await expect(page).not.toHaveURL(/\/admin\/users/);
    await expect(page.locator('main').first()).not.toBeEmpty();
    await new SidebarPage(page).expectLayout();
  });

  test('[06-29] ブラウザタブタイトル', async ({ loginAs, page }) => {
    // ログイン前・ログイン後・画面遷移後のどこでも「SecuAiGent」
    await page.goto(LOGIN_PATH);
    await expect(page).toHaveTitle(APP_TITLE);
    await loginAs('user');
    await expect(page).toHaveTitle(APP_TITLE);
    const sidebar = new SidebarPage(page);
    await sidebar.item(SIDEBAR_MESSAGES.library).click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page).toHaveTitle(APP_TITLE);
  });
});
