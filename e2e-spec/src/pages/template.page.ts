import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { chooseOption } from './feedback.page.ts';

/**
 * テンプレート管理（/admin/templates）の Page Object。
 * 移植元の画面: client/src/app/features/admin/management/template-list。
 */

export const TEMPLATE_PATH = '/admin/templates';
/** 1 ページの件数（移植元 TemplateListStore の pageSize の初期値）。 */
export const TEMPLATE_PAGE_SIZE = 10;
const LIST_API_PATH = '/api/admin/prompt-templates';

/** 画面の文言（public/i18n/ja.json の TEMPLATES.*。移植元と同じ）。 */
export const TEMPLATE_MESSAGES = {
  add: 'テンプレートを新規作成',
  addTitle: 'テンプレートを新規作成',
  editTitle: 'テンプレートの設定を編集',
  deleteTitle: '選択したテンプレートを削除します',
  deleteMessage: '削除したテンプレートは使用できなくなります。',
  allTeams: '全ての所属チーム',
  noTeam: '所属チームなし',
  deselect: '選択を解除',
  deleteSelected: '削除',
  noData: 'テンプレートが見つかりません。',
  required: 'この項目は必須です',
  sortByUpdated: '更新日時順',
  sortByName: 'テンプレート名順',
  sortAsc: '昇順',
  sortDesc: '降順',
  editAction: 'テンプレートの設定を編集',
  deleteAction: 'テンプレートを削除',
  namePlaceholder: 'テンプレートの名前を入力',
  promptPlaceholder: 'システムプロンプトを入力',
  descriptionPlaceholder: 'テンプレートの説明を入力',
  teamsPlaceholder: '所属チームを選択',
  create: '作成',
  save: '保存',
  searchPlaceholder: '検索ワードを入力',
} as const;

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  groups: string[] | null;
  updatedAt: string;
}

export interface TemplateListBody {
  content: TemplateListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export class TemplatePage {
  readonly page: Page;
  readonly main: Locator;
  readonly rows: Locator;
  readonly filterBar: Locator;
  readonly countText: Locator;
  readonly searchInput: Locator;
  readonly emptyMessage: Locator;
  readonly addButton: Locator;
  readonly deselectButton: Locator;
  readonly deleteSelectedButton: Locator;
  readonly dialog: Locator;
  readonly dialogConfirm: Locator;
  readonly dialogCancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.locator('main.term-main');
    this.rows = this.main.locator('.table-list-row--data');
    this.filterBar = this.main.locator('.library-filters');
    this.countText = this.filterBar.locator('.app-pagination span.text-label').first();
    this.searchInput = this.filterBar.getByPlaceholder(TEMPLATE_MESSAGES.searchPlaceholder);
    this.emptyMessage = this.main.getByText(TEMPLATE_MESSAGES.noData);
    this.addButton = this.main.getByRole('button', { name: TEMPLATE_MESSAGES.add });
    this.deselectButton = this.main.getByRole('button', { name: TEMPLATE_MESSAGES.deselect });
    this.deleteSelectedButton = this.main.getByRole('button', { name: TEMPLATE_MESSAGES.deleteSelected, exact: true });
    this.dialog = page.getByRole('dialog');
    this.dialogConfirm = page.getByTestId('dialog-confirm-button');
    this.dialogCancel = page.getByTestId('dialog-cancel-button');
  }

  private isListResponse(response: Response): boolean {
    return new URL(response.url()).pathname === LIST_API_PATH && response.request().method() === 'GET';
  }

  /**
   * テンプレート管理を開き、最初の一覧の応答を待つ。
   *
   * @returns 一覧 API の応答
   */
  async open(): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(r));
    await this.page.goto(TEMPLATE_PATH);
    const result = await response;
    await expect(this.addButton).toBeVisible();
    return result;
  }

  /**
   * 一覧が読み直されるのを待ちながら操作する。
   *
   * @param action 一覧の再取得を起こす操作
   * @returns 読み直した一覧 API の応答
   */
  async reloadedBy(action: () => Promise<void>): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(r));
    await action();
    return response;
  }

  /**
   * 検索欄に入力して、その検索語での一覧の応答を待つ。
   *
   * @param text 検索語
   * @returns 検索後の一覧 API の応答
   */
  async search(text: string): Promise<Response> {
    const response = this.page.waitForResponse(
      (r) => this.isListResponse(r) && new URL(r.url()).searchParams.get('search') === text
    );
    await this.searchInput.fill(text);
    return response;
  }

  /**
   * 所属チームフィルターを選ぶ。
   *
   * @param optionName 選択肢の文言（全ての所属チーム・所属チームなし・チーム名）
   * @returns 読み直した一覧 API の応答
   */
  async filterTeam(optionName: string): Promise<Response> {
    return this.reloadedBy(() => chooseOption(this.page, this.filterBar.locator('.app-select [aria-haspopup="listbox"]'), optionName));
  }

  /** 並べ替えのトリガー。 */
  get sortTrigger(): Locator {
    return this.filterBar.locator('.app-form-sort-input [aria-haspopup="menu"]');
  }

  /**
   * 並べ替えの項目または昇順・降順を選ぶ。
   *
   * @param label メニューの文言（更新日時順・テンプレート名順・昇順・降順）
   * @returns 読み直した一覧 API の応答
   */
  async sort(label: string): Promise<Response> {
    return this.reloadedBy(async () => {
      await this.sortTrigger.click();
      await this.page.getByRole('menuitemradio', { name: label, exact: true }).click();
    });
  }

  /** 上部（フィルター行）の「次のページ」。 */
  get topNextPage(): Locator {
    return this.filterBar.getByRole('button', { name: 'Next page' });
  }

  /** 下部（一覧の下）の「次のページ」。 */
  get bottomNextPage(): Locator {
    return this.main.locator('.app-pagination').last().getByRole('button', { name: 'Next page' });
  }

  /**
   * 一覧のチェックボックス（ヘッダー行は `header`、データ行はそのまま）。
   *
   * @param row 行のロケーター
   * @returns チェックボックス
   */
  checkboxOf(row: Locator): Locator {
    return row.getByRole('checkbox');
  }

  /** 一覧ヘッダーの全選択チェックボックス（デスクトップ幅）。 */
  get headerCheckbox(): Locator {
    return this.main.locator('.table-list-row--header').first().getByRole('checkbox');
  }

  /**
   * 行メニューを開き、項目を押す。
   *
   * @param row 行のロケーター
   * @param itemName メニューの文言
   */
  async clickRowMenu(row: Locator, itemName: string): Promise<void> {
    await row.locator('[data-testid^="template-menu-"]').click();
    await this.page.getByRole('button', { name: itemName }).click();
  }

  /**
   * 検索語で絞り込んで、名前が一致する行を返す。
   *
   * @param name テンプレート名
   * @returns 行のロケーター
   */
  rowByName(name: string): Locator {
    return this.rows.filter({ hasText: name });
  }

  /**
   * 追加・編集のダイアログの入力欄に入れる。undefined の欄は触らない。
   *
   * @param values 名前・システムプロンプト・説明
   */
  async fillForm(values: { name?: string; systemPrompt?: string; description?: string }): Promise<void> {
    if (values.name !== undefined) await this.dialog.getByPlaceholder(TEMPLATE_MESSAGES.namePlaceholder).fill(values.name);
    if (values.systemPrompt !== undefined) {
      await this.dialog.getByPlaceholder(TEMPLATE_MESSAGES.promptPlaceholder).fill(values.systemPrompt);
    }
    if (values.description !== undefined) {
      await this.dialog.getByPlaceholder(TEMPLATE_MESSAGES.descriptionPlaceholder).fill(values.description);
    }
  }

  /**
   * ダイアログの「所属チーム」を選んで確定する（複数選択）。
   *
   * @param teamNames チーム名
   */
  async selectTeams(teamNames: string[]): Promise<void> {
    for (const team of teamNames) {
      // 複数選択の一覧は、1 つ選んでも開いたまま。閉じているときだけ開く
      if ((await this.page.getByRole('listbox').count()) === 0) await this.dialog.locator('#groups-multi-select-search').click();
      await this.page.getByRole('option', { name: team, exact: true }).click();
    }
    // 開いている間の選択は仮の値。「決定」で確定すると一覧が閉じる
    await this.page.getByRole('listbox').getByRole('button', { name: '決定', exact: true }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
    for (const team of teamNames) await expect(this.dialog.locator('.combobox-trigger .combobox-chip', { hasText: team })).toBeVisible();
  }

  /**
   * 表示中の行の、見えているセルの文言（列ごと）を返す。
   *
   * @returns 行ごとのセル文言の配列（名前・システムプロンプト・所属チーム・更新日時）
   */
  async readRows(): Promise<string[][]> {
    return this.rows.evaluateAll((rows) =>
      rows.map((row) => {
        const content = row.querySelector('.table-list-row-content');
        if (!content) return [];
        return Array.from(content.children).map((cell) => (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
      })
    );
  }
}
