import { expect, type Locator, type Page } from '@playwright/test';
import { chooseSortItem, gotoAdminPage } from './service-list-controls.ts';

/** チャット履歴画面（/admin/chat-history。管理者が全ユーザーのチャットを一覧する）の Page Object。 */

export const CHAT_HISTORY_PATH = '/admin/chat-history';

/** 画面の文言（public/i18n/ja.json の CHAT_HISTORY.*・COMMON.PERIOD_FILTER.*。移植元の ja.json と同じ）。 */
export const CHAT_HISTORY_MESSAGES = {
  title: 'チャット履歴',
  noData: 'チャット履歴が見つかりません。',
  allUsers: '全てのユーザー',
  allPeriods: '全ての期間',
  today: '今日',
  past7days: '過去7日間',
  past30days: '過去30日間',
  sortUpdated: '更新日時順',
  sortUser: '更新者名順',
  sortChat: 'チャット名順',
  asc: '昇順',
  desc: '降順',
} as const;

const USER_PREFIX = 'admin-chat-history-user';
const PERIOD_PREFIX = 'admin-chat-history-period';
const SORT_PREFIX = 'admin-chat-history-sort';

export class ChatHistoryPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly userTrigger: Locator;
  readonly periodTrigger: Locator;
  readonly sortTrigger: Locator;
  readonly rows: Locator;
  readonly loading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByTestId('admin-chat-history-search-input');
    this.userTrigger = page.getByTestId(`${USER_PREFIX}-trigger`);
    this.periodTrigger = page.getByTestId(`${PERIOD_PREFIX}-trigger`);
    this.sortTrigger = page.getByTestId(`${SORT_PREFIX}-trigger`);
    this.rows = page.getByTestId('admin-chat-history-list-row');
    this.loading = page.getByLabel('読み込み中');
  }

  /** チャット履歴の一覧を開く。 */
  async goto(): Promise<void> {
    await gotoAdminPage(this.page, CHAT_HISTORY_PATH);
    await expect(this.searchInput).toBeVisible();
  }

  /**
   * 検索欄に入れる（入力が止まってから反映される）。
   *
   * @param keyword 検索ワード
   */
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  /** 画面に出ているチャット名（上から順）。 */
  async roomNames(): Promise<string[]> {
    return this.rows.locator('.table-list-title').allTextContents();
  }

  /** 画面に出ている更新者名（上から順）。 */
  async userNames(): Promise<string[]> {
    return this.rows.evaluateAll((rows) =>
      rows.map((row) => row.querySelectorAll<HTMLElement>('.table-list-col-date')[1]?.innerText.trim() ?? '')
    );
  }

  /**
   * ユーザーのフィルターで選ぶ。
   *
   * @param userName ユーザー名
   * @param typed 検索欄に先に入力する文字（絞り込んでから選ぶとき）
   */
  async chooseUser(userName: string, typed?: string): Promise<void> {
    await this.userTrigger.click();
    if (typed !== undefined) await this.userTrigger.locator('input').fill(typed);
    await this.page.getByTestId(`${USER_PREFIX}-option`).filter({ hasText: userName }).first().click();
  }

  /**
   * 期間のフィルターで選ぶ。
   *
   * @param label 「今日」「過去7日間」など
   */
  async choosePeriod(label: string): Promise<void> {
    await this.periodTrigger.click();
    await this.page.getByTestId(`${PERIOD_PREFIX}-option`).filter({ hasText: new RegExp(`^${label}$`) }).click();
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
   * 行の矢印ボタン（詳細へ）。
   *
   * @param roomName チャット名
   * @returns ボタン
   */
  detailButton(roomName: string): Locator {
    return this.rows.filter({ hasText: roomName }).getByTestId('admin-chat-history-detail-button');
  }
}

export { PERIOD_PREFIX as CHAT_HISTORY_PERIOD_PREFIX };
