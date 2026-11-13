import { expect, type Locator, type Page } from '@playwright/test';
import { chooseSelectOption, chooseSort, dialogOf, textsOf } from './admin-widgets.ts';

/** ライブラリ画面（/library）の Page Object。コンテンツ一覧とタグ管理の 2 タブ。 */

export const LIBRARY_PATH = '/library';
/** 一覧の 1 ページの件数（frontend の LIBRARY_PAGE_SIZE）。 */
export const LIBRARY_PAGE_SIZE = 5;

/** 画面の文言（public/i18n/ja.json の ADMIN.LIBRARY.*）。 */
export const LIBRARY_MESSAGES = {
  title: 'ライブラリ',
  tabContents: 'コンテンツ一覧',
  tabTags: 'タグ管理',
  allUsers: '全てのユーザー',
  onlyMine: '自分のみ',
  onlyOthers: '他ユーザーのみ',
  allTags: '全てのタグ',
  sortUpdatedAt: '更新日時順',
  sortTitle: 'コンテンツ名順',
  menuEdit: 'コンテンツの設定を編集',
  menuCopyLink: '共有リンクをコピー',
  menuDelete: 'ライブラリから削除',
  editDialogTitle: 'コンテンツの設定を編集',
  deleteDialogTitle: 'ライブラリから削除します',
  deleteFailed: 'ライブラリの削除に失敗しました',
  updateFailed: 'ライブラリの編集に失敗しました',
  tagAdd: 'タグを新規作成',
  tagEditTitle: 'タグの設定を編集',
  tagMenuEdit: 'タグの設定を編集',
  tagMenuDelete: 'タグを削除',
  tagDeleteTitle: '選択したタグを削除します',
  tagSortName: 'タグ名順',
  back: '戻る',
} as const;

export class LibraryPage {
  readonly page: Page;
  readonly tablist: Locator;
  readonly searchInput: Locator;
  readonly rows: Locator;
  readonly tagAddButton: Locator;
  readonly tagRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tablist = page.getByRole('tablist');
    this.searchInput = page.getByTestId('library-search-input');
    this.rows = page.getByTestId('library-content-item');
    this.tagAddButton = page.getByRole('button', { name: LIBRARY_MESSAGES.tagAdd }).first();
    this.tagRows = page.locator('.table-list-row--data');
  }

  /**
   * ライブラリ画面を URL で開く。
   *
   * @param query クエリ文字列（例 `?tab=tags`）
   */
  async goto(query = ''): Promise<void> {
    await this.page.goto(`${LIBRARY_PATH}${query}`);
    await expect(this.page.getByRole('heading', { name: LIBRARY_MESSAGES.title })).toBeVisible();
  }

  /** サイドバーの「データ活用」→「ライブラリ」から開く。 */
  async openFromSidebar(): Promise<void> {
    await this.page.getByTitle(LIBRARY_MESSAGES.title, { exact: true }).first().click();
    await expect(this.page).toHaveURL(new RegExp(`${LIBRARY_PATH}$`));
    await expect(this.page.getByRole('heading', { name: LIBRARY_MESSAGES.title })).toBeVisible();
  }

  /**
   * タブを切り替える。
   *
   * @param label タブの文言
   */
  async selectTab(label: string): Promise<void> {
    await this.tablist.getByText(label, { exact: true }).click();
  }

  /** コンテンツ一覧が表示されている（検索欄が出ている）。 */
  async expectContentsVisible(): Promise<void> {
    await expect(this.searchInput).toBeVisible();
  }

  /** タグ管理が表示されている（「タグを新規作成」が出ている）。 */
  async expectTagsVisible(): Promise<void> {
    await expect(this.tagAddButton).toBeVisible();
  }

  /**
   * 検索欄に入力する（300ms のデバウンス後に一覧が絞り込まれる）。
   *
   * @param text 検索語
   */
  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
  }

  /**
   * タイトルで行を探す。
   *
   * @param title ライブラリ名
   * @returns 行のロケーター
   */
  row(title: string): Locator {
    return this.rows.filter({ hasText: title });
  }

  /** 画面に出ている行のタイトルを上から順に返す。 */
  async titles(): Promise<string[]> {
    return textsOf(this.rows, (row) => row.locator('.table-list-title'));
  }

  /** ユーザーフィルター（1 つ目の Select）。 */
  get userFilter(): Locator {
    return this.page.locator('.app-select').nth(0);
  }

  /** タグフィルター（2 つ目の Select）。 */
  get tagFilter(): Locator {
    return this.page.locator('.app-select').nth(1);
  }

  /**
   * ユーザーフィルターを選ぶ。
   *
   * @param label 選択肢の文言
   */
  async chooseUserFilter(label: string): Promise<void> {
    await chooseSelectOption(this.userFilter, label);
  }

  /**
   * タグフィルターを選ぶ。
   *
   * @param label 選択肢の文言
   */
  async chooseTagFilter(label: string): Promise<void> {
    await chooseSelectOption(this.tagFilter, label);
  }

  /**
   * 並べ替えを選ぶ。
   *
   * @param choice 並べ替え項目の文言と昇降
   */
  async chooseSort(choice: { field?: string; order?: string }): Promise<void> {
    await chooseSort(this.page.locator('.app-form-sort-input').first(), choice);
  }

  /** 一覧の上のページ送りの件数表示（「1-5件 / 6件」など）。 */
  get countDisplay(): Locator {
    return this.page.getByText(/^(0件|\d+-\d+件 \/ \d+件)$/).first();
  }

  /** 次のページへ（上のページ送り）。 */
  async nextPage(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next page' }).first().click();
  }

  /**
   * 行の操作メニューを開き、項目を選ぶ。
   *
   * @param title ライブラリ名
   * @param itemLabel メニュー項目の文言
   */
  async rowMenu(title: string, itemLabel: string): Promise<void> {
    // 検索の反映で行が描き直されると最初のクリックが空振りすることがあるため、メニューが開くまでやり直す
    const item = this.page.getByRole('button', { name: itemLabel });
    await expect(async () => {
      await this.row(title).locator('[data-testid^="library-menu-"]').click();
      await expect(item).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await item.click();
  }

  /**
   * 「コンテンツの設定を編集」ダイアログ。
   *
   * @returns ダイアログのロケーター
   */
  editDialog(): Locator {
    return dialogOf(this.page, LIBRARY_MESSAGES.editDialogTitle);
  }

  /**
   * タグ管理の行をタグ名で探す。
   *
   * @param name タグ名
   * @returns 行のロケーター
   */
  tagRow(name: string): Locator {
    return this.tagRows.filter({ hasText: name });
  }

  /**
   * タグの行の操作メニューを開き、項目を選ぶ。
   *
   * @param name タグ名
   * @param itemLabel メニュー項目の文言
   */
  async tagRowMenu(name: string, itemLabel: string): Promise<void> {
    await this.tagRow(name).locator('[data-testid^="tag-menu-"]').click();
    await this.page.getByRole('button', { name: itemLabel }).click();
  }
}
