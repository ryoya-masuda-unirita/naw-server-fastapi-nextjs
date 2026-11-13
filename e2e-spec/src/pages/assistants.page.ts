import { expect, type Locator, type Page } from '@playwright/test';
import { chooseFromSelect, chooseSortItem, dataRows, filterRow, gotoAdminPage } from './service-list-controls.ts';

/** アシスタント管理画面（/admin/assistants。アシスタント一覧・カテゴリ管理の 2 タブ）の Page Object。 */

export const ASSISTANTS_PATH = '/admin/assistants';
export const CATEGORY_TAB_QUERY = '?tab=assistant-category';

/** 画面の文言（public/i18n/ja.json の ADMIN.ASSISTANT.*。移植元の ja.json と同じ）。 */
export const ASSISTANT_MESSAGES = {
  tabAssistant: 'アシスタント一覧',
  tabCategory: 'カテゴリ管理',
  createAssistant: 'アシスタントを新規作成',
  createCategory: 'カテゴリを新規作成',
  editAssistantTitle: 'アシスタントの設定を編集',
  editCategoryTitle: 'カテゴリの設定を編集',
  assistantNoData: 'アシスタントが見つかりません',
  categoryNoData: 'カテゴリが見つかりません',
  deleteAssistantTitle: '選択したアシスタントを削除します',
  deleteCategoryTitle: '選択したカテゴリを削除します',
  createAssistantSuccess: 'アシスタントを作成しました',
  updateAssistantSuccess: 'アシスタントを更新しました',
  deleteAssistantSuccess: 'アシスタントを削除しました',
  createCategorySuccess: 'カテゴリを作成しました',
  updateCategorySuccess: 'カテゴリを更新しました',
  deleteCategorySuccess: 'カテゴリを削除しました',
  clearSelection: '選択を解除',
  delete: '削除',
  edit: 'アシスタントの設定を編集',
  allServers: '全ての接続サーバー',
  allCategories: '全てのカテゴリ',
  allTeams: '全ての所属チーム',
  sortUpdatedAt: '更新日時順',
  sortDisplayName: 'アシスタント表示名順',
  sortHistory: '履歴送信順',
  sortCategoryName: 'カテゴリ名順',
  asc: '昇順',
  desc: '降順',
  required: 'この項目は必須です',
  serverSecure: 'セキュア',
  serverCloudGeneral: 'クラウド(一般)',
  serverCloudRag: 'クラウド(学習先指定)',
} as const;

export type ServerLabel = typeof ASSISTANT_MESSAGES.serverSecure | typeof ASSISTANT_MESSAGES.serverCloudGeneral | typeof ASSISTANT_MESSAGES.serverCloudRag;

export class AssistantsPage {
  readonly page: Page;
  readonly assistantTab: Locator;
  readonly categoryTab: Locator;
  readonly searchInput: Locator;
  readonly serverFilter: Locator;
  readonly categoryFilter: Locator;
  readonly teamFilter: Locator;
  readonly sortTrigger: Locator;
  readonly dialog: Locator;
  /** 作成・編集ダイアログの「アシスタント表示名」入力欄。 */
  readonly nameInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assistantTab = page.getByRole('button', { name: ASSISTANT_MESSAGES.tabAssistant, exact: true });
    this.categoryTab = page.getByRole('button', { name: ASSISTANT_MESSAGES.tabCategory, exact: true });
    this.searchInput = page.getByPlaceholder('検索ワードを入力');
    const selects = filterRow(page).locator('.library-filter-selects .app-select');
    this.serverFilter = selects.nth(0);
    this.categoryFilter = selects.nth(1);
    this.teamFilter = selects.nth(2);
    this.sortTrigger = filterRow(page).locator('.library-sort-wrap').getByRole('button').first();
    this.dialog = page.getByRole('dialog');
    this.nameInput = this.dialog.getByPlaceholder('アシスタント表示名を入力');
  }

  /** アシスタント一覧タブを開く。 */
  async goto(): Promise<void> {
    await gotoAdminPage(this.page, ASSISTANTS_PATH);
    await expect(this.assistantTab).toBeVisible();
  }

  /** カテゴリ管理タブを開く（URL 直接）。 */
  async gotoCategoryTab(): Promise<void> {
    await gotoAdminPage(this.page, `${ASSISTANTS_PATH}${CATEGORY_TAB_QUERY}`);
    await expect(this.categoryTab).toBeVisible();
  }

  /**
   * 検索欄に入れて、結果が反映されるまで待つ（入力が止まって 300ms 後に反映される）。
   *
   * @param keyword 検索ワード
   */
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  /**
   * 表示名で行を取る。
   *
   * @param name 表示名
   * @returns 行
   */
  row(name: string): Locator {
    return dataRows(this.page).filter({ has: this.page.locator('.table-list-title', { hasText: name }) });
  }

  /**
   * 行の「編集・削除」メニューを開く。
   *
   * @param name 行の名前
   */
  async openRowMenu(name: string): Promise<void> {
    await this.row(name).first().locator('[data-testid^="assistant-menu-"], [data-testid^="category-menu-"]').click();
  }

  /**
   * 行のメニューの項目を押す。
   *
   * @param name 行の名前
   * @param item メニューの項目名
   */
  async clickRowMenuItem(name: string, item: string): Promise<void> {
    await this.openRowMenu(name);
    await this.page.getByRole('button', { name: item, exact: true }).click();
  }

  /**
   * 行のチェックボックスを入れる（行そのものを押しても切り替わる）。
   *
   * @param name 行の名前
   */
  async checkRow(name: string): Promise<void> {
    await this.row(name).first().locator('.table-list-checkbox').click();
  }

  /** 見出し行のチェックボックス（全選択）。 */
  get headerCheckbox(): Locator {
    return this.page.locator('.table-list-row--header .table-list-checkbox');
  }

  /**
   * フィルターのドロップダウンから選ぶ。
   *
   * @param host `serverFilter` など
   * @param optionName 選択肢の名前
   */
  async choose(host: Locator, optionName: string): Promise<void> {
    await chooseFromSelect(this.page, host, optionName);
  }

  /**
   * 並べ替えの項目（「更新日時順」「昇順」など）を選ぶ。
   *
   * @param itemName 項目名
   */
  async sortBy(itemName: string): Promise<void> {
    await chooseSortItem(this.page, this.sortTrigger, itemName);
  }

  /** ダイアログの確定ボタン（作成／保存）。 */
  confirmButton(name: '作成' | '保存' | '削除'): Locator {
    return this.dialog.getByRole('button', { name, exact: true });
  }

  /**
   * アシスタントを画面から作る。接続先・モデルは先頭の選択肢を選ぶ。
   *
   * @param options 入力値
   * @param options.name 表示名
   * @param options.server 接続サーバーの表示名（既定: クラウド(一般)）
   */
  async fillAssistantDialog(options: { name: string; server?: ServerLabel }): Promise<void> {
    const server = options.server ?? ASSISTANT_MESSAGES.serverCloudGeneral;
    await this.nameInput.fill(options.name);
    await this.dialog.locator('label.input-radio', { hasText: server }).click();
    await this.chooseFirstOption(this.dialog.locator('#assistant-form-serverApi .app-select'));
    if (server === ASSISTANT_MESSAGES.serverSecure) {
      await this.dialog.getByPlaceholder('サービスIDを入力').fill('spec-service-id');
    } else {
      await this.chooseFirstOption(this.dialog.locator('#assistant-form-model .app-select'));
    }
  }

  /**
   * ドロップダウンの先頭の選択肢を選ぶ。
   *
   * @param host ドロップダウン
   */
  async chooseFirstOption(host: Locator): Promise<void> {
    await host.locator('.trigger-wrapper').click();
    await this.page.getByRole('option').first().click();
  }
}
