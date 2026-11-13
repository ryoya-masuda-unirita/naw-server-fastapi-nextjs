import { expect, type Locator, type Page, type Response } from '@playwright/test';

/**
 * フィードバック管理（/admin/feedback）の Page Object。3 タブ（回答精度評価・チャット満足度・回答数一覧）で共通の操作を持つ。
 * 移植元の画面: client/src/app/features/admin/management/feedback-list。
 * 一覧は「フィルター → 並べ替え → ページ送り」を画面で操作し、そのたびに出る API の応答を待って返す。
 */

export const FEEDBACK_PATH = '/admin/feedback';
/** 1 ページの件数（移植元 3 タブの pageSize の初期値）。 */
export const FEEDBACK_PAGE_SIZE = 5;

/** 画面の文言（public/i18n/ja.json の FEEDBACK.*。移植元と同じ）。 */
export const FEEDBACK_MESSAGES = {
  title: 'フィードバック',
  tabAccuracy: '回答精度評価',
  tabSatisfaction: 'チャット満足度',
  tabCount: '回答数一覧',
  noData: 'データがありません',
  allAssistants: '全てのアシスタント',
  allAccuracy: '全ての精度',
  allFolders: '全ての学習先フォルダ',
  allSatisfaction: '全ての満足度',
  allResponses: '全ての精度評価',
  accurate: '正確',
  inaccurate: '不正確',
  responded: '回答済み',
  noResponse: '未回答',
  specifyFolder: '学習先フォルダを指定',
  addLearning: '追加学習',
  sortAsc: '昇順',
  sortDesc: '降順',
  folderPlaceholder: '学習先フォルダを選択',
} as const;

export type FeedbackTab = 'accuracy' | 'satisfaction' | 'count';

/** タブごとの一覧 API のパス（`/api/admin/...`）。 */
export const FEEDBACK_LIST_API: Record<FeedbackTab, string> = {
  accuracy: '/api/admin/feedbackMessage',
  satisfaction: '/api/admin/feedbackRoom',
  count: '/api/admin/feedbackUser',
};

const TAB_LABELS: Record<FeedbackTab, string> = {
  accuracy: FEEDBACK_MESSAGES.tabAccuracy,
  satisfaction: FEEDBACK_MESSAGES.tabSatisfaction,
  count: FEEDBACK_MESSAGES.tabCount,
};

/** 一覧 API の応答（3 タブ共通の `feedbacks` ページング部分だけ）。 */
export interface FeedbackPaged<T> {
  feedbacks: { content: T[]; totalElements: number; totalPages: number; number: number; size: number };
}

/**
 * Select / SelectWithSearch / FormSortInput の選択肢を選ぶ共通操作。
 * ドロップダウンは本文の外に描画されるため、ページ全体から `role=option` を探す。
 */
export async function chooseOption(page: Page, trigger: Locator, optionName: string | RegExp): Promise<void> {
  await trigger.click();
  await page.getByRole('option', { name: optionName, exact: typeof optionName === 'string' }).first().click();
}

export class FeedbackPage {
  readonly page: Page;
  /** 画面の本体領域（サイドバーの `<main>` と区別する）。 */
  readonly main: Locator;
  readonly rows: Locator;
  readonly countText: Locator;
  readonly nextPage: Locator;
  readonly previousPage: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.locator('main.term-main');
    this.rows = this.main.locator('.table-list-row--data');
    this.countText = this.main.locator('.library-filters .app-pagination span.text-label').first();
    this.nextPage = this.main.locator('.library-filters').getByRole('button', { name: 'Next page' });
    this.previousPage = this.main.locator('.library-filters').getByRole('button', { name: 'Previous page' });
    this.emptyMessage = this.main.getByText(FEEDBACK_MESSAGES.noData);
  }

  /** 一覧 API の応答を待つ条件（タブの API で、読み込みが成功したもの）。 */
  private isListResponse(tab: FeedbackTab, response: Response): boolean {
    return new URL(response.url()).pathname === FEEDBACK_LIST_API[tab] && response.request().method() === 'GET';
  }

  /**
   * フィードバック管理を開き、指定のタブにする。最初の一覧の応答を待って返す。
   *
   * @param tab 開くタブ
   * @returns 一覧 API の応答（本文は `json()` で読める）
   */
  async open(tab: FeedbackTab = 'accuracy'): Promise<Response> {
    const first = this.page.waitForResponse((r) => this.isListResponse('accuracy', r));
    await this.page.goto(FEEDBACK_PATH);
    const firstResponse = await first;
    if (tab === 'accuracy') {
      await this.expectLoaded();
      return firstResponse;
    }
    return this.switchTab(tab);
  }

  /**
   * タブを切り替える。切り替え先の一覧の応答を待って返す。
   *
   * @param tab 切り替え先のタブ
   * @returns 一覧 API の応答
   */
  async switchTab(tab: FeedbackTab): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(tab, r));
    await this.tabButton(tab).click();
    return response;
  }

  /** 3 タブの見出しが表示されている。 */
  async expectLoaded(): Promise<void> {
    await expect(this.tabButton('accuracy')).toBeVisible();
    await expect(this.tabButton('satisfaction')).toBeVisible();
    await expect(this.tabButton('count')).toBeVisible();
  }

  /**
   * タブのボタン。
   *
   * @param tab タブ
   * @returns ボタンのロケーター
   */
  tabButton(tab: FeedbackTab): Locator {
    return this.page.getByRole('button', { name: TAB_LABELS[tab], exact: true });
  }

  /**
   * フィルター行の Select（ドロップダウン）のトリガー。左から 0 始まり。
   * 回答精度: 0=アシスタント 1=精度 2=学習先フォルダ / 満足度: 0=アシスタント 1=満足度 2=学習先フォルダ / 回答数: 0=回答状況 1=満足度。
   *
   * @param index フィルターの順番
   * @returns トリガーのロケーター
   */
  filter(index: number): Locator {
    return this.main.locator('.library-filters [aria-haspopup="listbox"]:not(input)').nth(index);
  }

  /** 並べ替えのトリガー。 */
  get sortTrigger(): Locator {
    return this.main.locator('.app-form-sort-input [aria-haspopup="menu"]');
  }

  /**
   * フィルターを選び、一覧が読み直されるのを待つ。
   *
   * @param tab 表示中のタブ
   * @param index フィルターの順番（`filter()` を参照）
   * @param optionName 選ぶ選択肢の文言
   * @returns 読み直した一覧 API の応答
   */
  async applyFilter(tab: FeedbackTab, index: number, optionName: string | RegExp): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(tab, r));
    await chooseOption(this.page, this.filter(index), optionName);
    return response;
  }

  /**
   * 並べ替えの項目を選び、一覧が読み直されるのを待つ。
   *
   * @param tab 表示中のタブ
   * @param fieldLabel 並べ替え項目の文言（例 `精度順`）
   * @returns 読み直した一覧 API の応答
   */
  async sortBy(tab: FeedbackTab, fieldLabel: string): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(tab, r));
    await this.sortTrigger.click();
    await this.page.getByRole('menuitemradio', { name: fieldLabel, exact: true }).click();
    return response;
  }

  /**
   * 並べ替えの昇順・降順を選び、一覧が読み直されるのを待つ。
   *
   * @param tab 表示中のタブ
   * @param order `昇順` または `降順`
   * @returns 読み直した一覧 API の応答
   */
  async sortOrder(tab: FeedbackTab, order: string): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(tab, r));
    await this.sortTrigger.click();
    await this.page.getByRole('menuitemradio', { name: order, exact: true }).click();
    return response;
  }

  /**
   * 「次のページ」を押し、一覧が読み直されるのを待つ。
   *
   * @param tab 表示中のタブ
   * @returns 読み直した一覧 API の応答
   */
  async goToNextPage(tab: FeedbackTab): Promise<Response> {
    const response = this.page.waitForResponse((r) => this.isListResponse(tab, r));
    await this.nextPage.click();
    return response;
  }

  /**
   * 表示中の行の、見えているセルの文言（列ごと）を返す。
   *
   * @returns 行ごとのセル文言の配列
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

/**
 * 応答の `feedbacks.content` を取り出す。
 *
 * @param response 一覧 API の応答
 * @returns ページング情報つきの本文
 */
export async function readPaged<T>(response: Response): Promise<FeedbackPaged<T>['feedbacks']> {
  expect(response.ok(), `一覧 API が失敗: ${response.status()} ${response.url()}`).toBe(true);
  return ((await response.json()) as FeedbackPaged<T>).feedbacks;
}
