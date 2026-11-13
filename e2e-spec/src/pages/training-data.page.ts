import { expect, type Locator, type Page } from '@playwright/test';
import { chooseFromSelect, chooseSortItem, filterRow, gotoAdminPage } from './service-list-controls.ts';

/** 学習データ（/admin/training-data の一覧と、/admin/training-data/:id のフォルダ詳細）の Page Object。 */

export const TRAINING_DATA_PATH = '/admin/training-data';

/** 画面の文言（public/i18n/ja.json の LEARNING_DATA.*。移植元の ja.json と同じ）。 */
export const TRAINING_MESSAGES = {
  back: '戻る',
  folderMenu: '学習先フォルダ',
  menuEditFolder: '学習フォルダの設定を編集',
  menuDeleteFolder: '学習フォルダを削除',
  createFolder: '学習先フォルダを新規作成',
  addData: '学習データを追加',
  bulkSync: '一括同期',
  localInfoTitle: 'ローカル接続する学習データについて',
  noData: 'データがありません',
  allUsers: '全てのユーザー',
  allSettings: '全ての学習設定',
  statusOn: 'ON',
  statusOff: 'OFF',
  today: '今日',
  past7days: '過去7日間',
  past30days: '過去30日間',
  sortUpdated: '更新日時順',
  sortName: '学習データの表示名順',
  sortUpdatedBy: '更新者名順',
  sortLearning: '学習設定順',
  asc: '昇順',
  desc: '降順',
  deselect: '選択を解除',
  editName: '名前を変更',
  delete: '削除',
  deleteFolderConfirmTitle: '選択した学習先フォルダを削除します',
  deleteDataConfirmTitle: '選択した学習データをこの学習先フォルダから削除します',
  setLearningOff: '学習設定をOFF',
  setLearningOn: '学習設定をON',
  menuEditData: '学習データの設定を編集',
  menuDeleteData: 'この学習先フォルダから削除',
  menuDownload: 'デバイスに保存',
} as const;

const USER_PREFIX = 'training-data-file-user';
export const TRAINING_PERIOD_PREFIX = 'training-data-file-period';
const SORT_PREFIX = 'training-data-file-sort';

/** 学習データ一覧の列の位置（参照資料のリンク・更新日時・更新者名・学習設定）。 */
export const FILE_COLUMN = { reference: 0, updatedAt: 1, updatedBy: 2, status: 3 } as const;

export class TrainingDataPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly backLink: Locator;
  readonly folderMenuButton: Locator;
  readonly searchInput: Locator;
  readonly userTrigger: Locator;
  readonly periodTrigger: Locator;
  readonly statusFilter: Locator;
  readonly sortTrigger: Locator;
  readonly rows: Locator;
  readonly addButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.backLink = page.getByRole('link', { name: TRAINING_MESSAGES.back });
    this.folderMenuButton = page.getByRole('button', { name: TRAINING_MESSAGES.folderMenu, exact: true });
    this.searchInput = page.getByTestId('training-data-file-search-input');
    this.userTrigger = page.getByTestId(`${USER_PREFIX}-trigger`);
    this.periodTrigger = page.getByTestId(`${TRAINING_PERIOD_PREFIX}-trigger`);
    this.statusFilter = filterRow(page).locator('.app-select');
    this.sortTrigger = page.getByTestId(`${SORT_PREFIX}-trigger`);
    this.rows = page.getByTestId('training-data-file-row');
    this.addButton = page.getByTestId('training-data-add-button');
    this.dialog = page.getByRole('dialog');
  }

  /** 学習先フォルダの一覧を開く。 */
  async gotoList(): Promise<void> {
    await gotoAdminPage(this.page, TRAINING_DATA_PATH);
    await expect(this.page.getByRole('button', { name: TRAINING_MESSAGES.createFolder })).toBeVisible();
  }

  /**
   * フォルダの詳細（学習データの一覧）を開く。
   *
   * @param folderId フォルダ ID
   * @param name フォルダ名（見出しに出る）
   */
  async gotoDetail(folderId: string, name?: string): Promise<void> {
    await gotoAdminPage(this.page, `${TRAINING_DATA_PATH}/${folderId}`);
    if (name) await expect(this.heading).toHaveText(name);
    else await expect(this.heading).toBeVisible();
  }

  /** 画面に出ている学習データの表示名（上から順）。 */
  async fileNames(): Promise<string[]> {
    return this.rows.locator('.table-list-title').allTextContents();
  }

  /**
   * 画面に出ている行の、指定の列の表示文字列（上から順）。
   *
   * @param column `FILE_COLUMN` の値
   */
  async columnTexts(column: number): Promise<string[]> {
    return this.rows.evaluateAll(
      (rows, index) =>
        rows.map((row) => (row.querySelectorAll<HTMLElement>('.table-list-row-date')[index]?.innerText ?? '').trim()),
      column
    );
  }

  /**
   * 表示名で行を取る。
   *
   * @param name 表示名
   * @returns 行
   */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.locator('.table-list-title', { hasText: name }) });
  }

  /**
   * 行のチェックボックスを入れる。
   *
   * @param name 表示名
   */
  async checkRow(name: string): Promise<void> {
    await this.row(name).first().locator('.table-list-checkbox').click();
  }

  /** 見出し行のチェックボックス（全選択）。 */
  get headerCheckbox(): Locator {
    return this.page.locator('.table-list-row--header .table-list-checkbox');
  }

  /**
   * 検索欄に入れる（入力が止まってから反映される）。
   *
   * @param keyword 検索ワード
   */
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  /**
   * ユーザーのフィルターで選ぶ。
   *
   * @param userName ユーザー名
   */
  async chooseUser(userName: string): Promise<void> {
    await this.userTrigger.click();
    await this.page.getByTestId(`${USER_PREFIX}-option`).filter({ hasText: userName }).first().click();
  }

  /**
   * 期間のフィルターで選ぶ。
   *
   * @param label 「今日」「過去7日間」など
   */
  async choosePeriod(label: string): Promise<void> {
    await this.periodTrigger.click();
    await this.page.getByTestId(`${TRAINING_PERIOD_PREFIX}-option`).filter({ hasText: new RegExp(`^${label}$`) }).click();
  }

  /**
   * 学習設定のフィルターで選ぶ。
   *
   * @param label 「ON」「OFF」
   */
  async chooseStatus(label: string): Promise<void> {
    await chooseFromSelect(this.page, this.statusFilter, label);
  }

  /**
   * 並べ替えの項目（「更新日時順」「昇順」など）を選ぶ。
   *
   * @param itemName 項目名
   */
  async sortBy(itemName: string): Promise<void> {
    await chooseSortItem(this.page, this.sortTrigger, itemName);
  }

  /**
   * 行の「…」メニューの項目を押す。
   *
   * @param name 表示名
   * @param testid 項目の data-testid
   */
  async clickRowMenu(name: string, testid: string): Promise<void> {
    await this.row(name).first().getByTestId('training-data-file-menu-button').click();
    await this.page.getByTestId(testid).click();
  }

  /**
   * フォルダの詳細ヘッダーのメニューを開いて項目を押す。
   *
   * @param item 項目名
   */
  async clickFolderMenu(item: string): Promise<void> {
    await this.folderMenuButton.click();
    await this.page.getByRole('menuitem', { name: item, exact: true }).click();
  }

  /**
   * 学習データを追加するダイアログに、テキストファイルを 1 つ渡して「完了」まで押す。
   *
   * @param fileName ファイル名
   * @param displayName 表示名（学習データ一覧に出る名前）
   */
  async addFile(fileName: string, displayName: string): Promise<void> {
    await this.addButton.click();
    await expect(this.dialog).toBeVisible();
    await this.dialog.locator('input[type=file]').first().setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E 用の学習データです。', 'utf-8'),
    });
    await this.page.getByTestId('training-data-add-display-name').fill(displayName);
    await this.page.getByTestId('training-data-add-submit').click();
  }
}
