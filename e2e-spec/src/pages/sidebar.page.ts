import { expect, type Locator, type Page } from '@playwright/test';

/** ログイン後の画面の枠（サイドバー・ユーザーメニュー・メイン領域）の Page Object。 */

/** 画面の文言（public/i18n/ja.json の SIDEBAR.*・USER_MENU.*。移植元の ja.json と同じ）。 */
export const SIDEBAR_MESSAGES = {
  newChat: '新しいチャット',
  searchChat: 'チャットを検索',
  dataUtilization: 'データ活用',
  library: 'ライブラリ',
  glossary: '用語辞書',
  dataSource: 'データソース',
  chat: 'チャット',
  externalServices: '外部サービス',
  ranabase: 'Ranabase',
  passwordSettings: 'パスワード設定',
  checkCredit: 'クレジット利用状況を確認',
  switchToAdmin: '管理者画面に切替',
  logout: 'ログアウト',
  logoutConfirmTitle: 'ログアウトします',
  cancel: 'キャンセル',
  managementConsole: '管理コンソール',
} as const;

/** ホバーで出るボタンを押す 1 回あたりの待ち時間。 */
const HOVER_RETRY_TIMEOUT_MS = 3_000;

export type UserMenuAction = 'password' | 'check-credit' | 'switch-role' | 'logout';

export class SidebarPage {
  readonly page: Page;
  readonly aside: Locator;
  readonly main: Locator;
  readonly userMenuButton: Locator;
  readonly toggleButton: Locator;
  readonly roomItems: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.aside = page.locator('aside').first();
    this.main = page.locator('main').first();
    this.userMenuButton = page.getByTestId('user-menu-button');
    this.toggleButton = page.getByRole('button', { name: 'toggle-sidebar' });
    this.roomItems = page.getByTestId('chat-history-item');
    this.dialog = page.getByRole('dialog');
  }

  /** ログイン後の枠（サイドバーとメイン領域）が表示されている。 */
  async expectLayout(): Promise<void> {
    await expect(this.aside).toBeVisible();
    await expect(this.main).toBeVisible();
  }

  /**
   * サイドバー内の文言。
   *
   * @param text 文言
   * @returns 要素
   */
  item(text: string): Locator {
    return this.aside.getByText(text, { exact: true });
  }

  /** ユーザーメニューを開く。 */
  async openUserMenu(): Promise<void> {
    await this.userMenuButton.click();
  }

  /**
   * ユーザーメニューの項目。
   *
   * @param action 項目
   * @returns 項目のボタン
   */
  userMenuItem(action: UserMenuAction): Locator {
    return this.page.getByTestId(`user-menu-${action}-button`);
  }

  /**
   * ユーザーメニューを開いて項目を選ぶ。
   *
   * @param action 選ぶ項目
   */
  async selectUserMenu(action: UserMenuAction): Promise<void> {
    await this.openUserMenu();
    await this.userMenuItem(action).click();
  }

  /** ログアウトの確認ダイアログの「ログアウト」ボタン。 */
  get logoutConfirmButton(): Locator {
    return this.dialog.getByRole('button', { name: SIDEBAR_MESSAGES.logout });
  }

  /** ログアウトの確認ダイアログの「キャンセル」ボタン。 */
  get logoutCancelButton(): Locator {
    return this.dialog.getByRole('button', { name: SIDEBAR_MESSAGES.cancel });
  }

  /** ユーザーメニューから「ログアウト」→ 確認ダイアログの「ログアウト」まで行う。 */
  async logout(): Promise<void> {
    await this.selectUserMenu('logout');
    await this.logoutConfirmButton.click();
  }

  /**
   * ルーム（チャット）の項目。
   *
   * @param name ルーム名
   * @returns サイドバーのルーム項目
   */
  room(name: string): Locator {
    return this.roomItems.filter({ hasText: name });
  }

  /**
   * ルームの「操作メニュー」を開いて項目を選ぶ。
   *
   * @param name ルーム名
   * @param menuItem メニューの項目名（「チャットの名前を変更」など）
   */
  async selectRoomMenu(name: string, menuItem: string): Promise<void> {
    const row = this.room(name);
    // 「操作メニュー」ボタンはマウスを載せたときだけ表示される。画面の再描画でマウスが外れることがあるため、載せ直しながら押す
    await expect(async () => {
      await row.hover();
      await row.getByRole('button', { name: '操作メニュー' }).click({ timeout: HOVER_RETRY_TIMEOUT_MS });
    }).toPass();
    await this.page.getByRole('menuitem', { name: menuItem }).click();
  }
}
