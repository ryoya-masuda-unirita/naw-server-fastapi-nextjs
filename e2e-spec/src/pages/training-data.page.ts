import { expect, type Locator, type Page } from '@playwright/test';
import { gotoAdminPage } from './service-list-controls.ts';

/** 学習データ（/admin/training-data の一覧と、/admin/training-data/:id のフォルダ詳細）の Page Object。 */

export const TRAINING_DATA_PATH = '/admin/training-data';

/** 追加ダイアログの表の見出しが、横書きで読めるとみなす最小の幅（px）。縦に 1 文字ずつ積まれると 0 近くになる。 */
const MIN_READABLE_LABEL_WIDTH_PX = 40;

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
  today: '今日',
  past7days: '過去7日間',
  past30days: '過去30日間',
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

export const TRAINING_PERIOD_PREFIX = 'training-data-file-period';

export class TrainingDataPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly backLink: Locator;
  readonly folderMenuButton: Locator;
  readonly searchInput: Locator;
  readonly periodTrigger: Locator;
  readonly rows: Locator;
  readonly addButton: Locator;
  readonly dialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.backLink = page.getByRole('link', { name: TRAINING_MESSAGES.back });
    this.folderMenuButton = page.getByRole('button', { name: TRAINING_MESSAGES.folderMenu, exact: true });
    this.searchInput = page.getByTestId('training-data-file-search-input');
    this.periodTrigger = page.getByTestId(`${TRAINING_PERIOD_PREFIX}-trigger`);
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
   * 期間のフィルターで選ぶ。
   *
   * @param label 「今日」「過去7日間」など
   */
  async choosePeriod(label: string): Promise<void> {
    await this.periodTrigger.click();
    await this.page.getByTestId(`${TRAINING_PERIOD_PREFIX}-option`).filter({ hasText: new RegExp(`^${label}$`) }).click();
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
    await this.expectUploadTableFitsDialog();
    await this.page.getByTestId('training-data-add-display-name').fill(displayName);
    await this.page.getByTestId('training-data-add-submit').click();
  }

  /**
   * 追加ダイアログの、ファイルを選ぶと出る表の見出しが、読める幅で、ダイアログの中に収まっていること（#456）。
   * 内側のカードが外枠より狭いと、左端の列が 0px に潰れて見出しが縦に積まれ、右の列がはみ出す。
   */
  async expectUploadTableFitsDialog(): Promise<void> {
    const labels = this.dialog.locator('.table-list-row--header .table-list-label');
    // 幅 0 に潰れた見出しは visible と判定されないため、存在だけを待ち、幅は下で測る
    await expect(labels.first()).toBeAttached();
    const boxes = await this.dialog.evaluate((dialog) => {
      // 外枠（dialog）ではなく、中身を収める内側のカードを基準にする。外枠は広くても、カードが狭いと表がはみ出す。
      // 狭い画面では、カードの中を横スクロールして全列に届くのが正しい状態なので、スクロールできる範囲の右端を使う
      const card = dialog.querySelector('.modal-content') ?? dialog;
      const right = card.getBoundingClientRect().left + card.scrollWidth;
      return [...dialog.querySelectorAll('.table-list-row--header .table-list-label')].map((label) => {
        const rect = label.getBoundingClientRect();
        return { text: label.textContent?.trim() ?? '', width: rect.width, overflow: rect.right - right };
      });
    });
    for (const box of boxes) {
      expect(box.width, `見出し「${box.text}」の幅`).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_WIDTH_PX);
      expect(box.overflow, `見出し「${box.text}」のカードからのはみ出し`).toBeLessThanOrEqual(0);
    }
  }
}
