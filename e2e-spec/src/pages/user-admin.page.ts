import { expect, type Locator, type Page } from '@playwright/test';
import { chooseSelectOption, chooseSort, dialogOf, openAdminConsolePage, textsOf } from './admin-widgets.ts';

/** ユーザー管理画面（/admin/users）の Page Object。 */

export const USER_ADMIN_PATH = '/admin/users';
/** 一覧の 1 ページの件数（frontend の INITIAL_USER_LIST_FILTER.pageSize）。 */
export const USER_PAGE_SIZE = 10;
/** 表示名・ユーザー ID の最大文字数（移植元 Validators.maxLength(100)）。 */
export const USER_TEXT_MAX_LENGTH = 100;

/** 画面の文言（public/i18n/ja.json の ADMIN.USER_MANAGEMENT.* と ADMIN_CONSOLE.*）。 */
export const USER_MESSAGES = {
  sidebar: 'ユーザー管理',
  create: 'ユーザーを新規作成',
  editTitle: 'ユーザーの設定を編集',
  deleteTitle: '選択したユーザーを削除します',
  allRoles: '全ての権限',
  roleAdmin: '管理者',
  roleGeneral: '一般',
  sortName: 'ユーザー表示名順',
  sortRole: '権限順',
  sortUpdatedAt: '更新日時順',
  createSuccess: 'ユーザーを作成しました',
  createFailed: 'ユーザーの作成に失敗しました',
  updateSuccess: 'ユーザーを更新しました',
  deleteSuccess: 'ユーザーを削除しました',
  deleteFailed: 'ユーザーの削除に失敗しました',
  issueLoginKeyLabel: 'ログインキーを発行する',
  reissue: '再発行',
  loginKeySet: '設定済み',
  loginKeyUnset: '未設定',
  deleteSelected: '削除',
  clearSelection: '選択を解除',
} as const;

export class UserAdminPage {
  readonly page: Page;
  readonly rows: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rows = page.getByTestId('admin-users-list-row');
    this.searchInput = page.getByTestId('user-search');
  }

  /** ユーザー管理を URL で開く（読み込みが終わるまで待つ）。 */
  async goto(): Promise<void> {
    await this.page.goto(USER_ADMIN_PATH);
    await expect(this.page.getByTestId('admin-users-create-button')).toBeVisible();
  }

  /** ユーザーメニューから管理コンソールに入り、サイドバーの「ユーザー管理」から開く。 */
  async openFromSidebar(): Promise<void> {
    await openAdminConsolePage(this.page, USER_MESSAGES.sidebar);
    await expect(this.page).toHaveURL(new RegExp(USER_ADMIN_PATH));
    await expect(this.page.getByTestId('admin-users-create-button')).toBeVisible();
  }

  /**
   * 検索語を入れる。
   *
   * @param text 検索語
   */
  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
  }

  /**
   * 表示名またはユーザー ID で行を探す。
   *
   * @param text 表示名・ユーザー ID の一部
   * @returns 行のロケーター
   */
  row(text: string): Locator {
    return this.rows.filter({ hasText: text });
  }

  /** 権限フィルター（Select）。 */
  get roleFilter(): Locator {
    return this.page.locator('.app-select').first();
  }

  /**
   * 権限フィルターを選ぶ。
   *
   * @param label 選択肢の文言
   */
  async chooseRole(label: string): Promise<void> {
    await chooseSelectOption(this.roleFilter, label);
  }

  /**
   * 並べ替えを選ぶ。
   *
   * @param choice 並べ替え項目の文言と昇降
   */
  async chooseSort(choice: { field?: string; order?: string }): Promise<void> {
    await chooseSort(this.page.locator('.app-form-sort-input').first(), choice);
  }

  /** 行の表示名を上から順に返す。 */
  async displayNames(): Promise<string[]> {
    return textsOf(this.rows, (row) => row.locator('.table-list-title'));
  }

  /** 一覧の上のページ送りの件数表示（「1-10 / 22」）。 */
  get countDisplay(): Locator {
    return this.page.getByText(/^\d+-\d+ \/ \d+$/).first();
  }

  /** 「ユーザーを新規作成」を押して、作成ダイアログを開く。 */
  async openCreateDialog(): Promise<Locator> {
    await this.page.getByTestId('admin-users-create-button').click();
    const dialog = dialogOf(this.page, USER_MESSAGES.create);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /**
   * 作成ダイアログに値を入れる（送信はしない）。
   *
   * @param dialog 作成ダイアログ
   * @param values displayName: 表示名、userId: ユーザー ID、role: 権限、issueLoginKey: ログインキーを発行するか
   */
  async fillCreateDialog(
    dialog: Locator,
    values: { displayName?: string; userId?: string; role?: 'admin' | 'general'; issueLoginKey?: boolean },
  ): Promise<void> {
    if (values.displayName !== undefined) await dialog.getByTestId('admin-users-display-name-input').fill(values.displayName);
    if (values.userId !== undefined) await dialog.getByTestId('admin-users-login-id-input').fill(values.userId);
    if (values.role === 'admin') await dialog.getByText(USER_MESSAGES.roleAdmin, { exact: true }).click();
    if (values.issueLoginKey) await dialog.getByTestId('admin-users-issue-login-key-switch').click();
  }

  /**
   * 行の操作メニューを開き、項目を選ぶ。
   *
   * @param text 行の表示名・ユーザー ID の一部
   * @param testid 押す項目の data-testid（編集 `admin-users-edit-button` / 削除 `admin-users-delete-button`）
   */
  async rowMenu(text: string, testid: 'admin-users-edit-button' | 'admin-users-delete-button'): Promise<void> {
    await this.row(text).getByTestId('admin-users-row-menu-button').click();
    await this.page.getByTestId(testid).click();
  }

  /**
   * 初期パスワード・ログインキーの表示ダイアログを閉じる。
   */
  async closeRevealDialog(): Promise<void> {
    await this.page.getByTestId('admin-users-password-reveal-close-button').click();
    await expect(this.page.getByTestId('admin-users-password-reveal-close-button')).toHaveCount(0);
  }

  /** 行のチェックボックス（行内の checkbox ロール）。 */
  checkbox(row: Locator): Locator {
    return row.getByRole('checkbox');
  }
}
