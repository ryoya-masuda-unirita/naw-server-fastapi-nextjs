import { expect, type Locator, type Page } from '@playwright/test';
import { chooseSelectOption, chooseSort, dialogOf, openAdminConsolePage, textsOf } from './admin-widgets.ts';

/** チーム管理（/admin/groups）の一覧と、チーム詳細（/admin/groups/:id/{users,assistants,templates}）の Page Object。 */

export const TEAM_LIST_PATH = '/admin/groups';
/** チーム一覧の 1 ページの件数（frontend の group-list-store の pageSize）。 */
export const TEAM_LIST_PAGE_SIZE = 5;
/** 詳細の各タブの 1 ページの件数（frontend の group-*-store の pageSize）。 */
export const TEAM_TAB_PAGE_SIZE = 25;
/** チーム名の最大長（移植元の入力チェック: 100 文字）。 */
export const TEAM_NAME_MAX_LENGTH = 100;

export type TeamTab = 'users' | 'assistants' | 'templates';

/** 画面の文言（public/i18n/ja.json の GROUPS.*・TEAM.*・COMMON.*）。 */
export const TEAM_MESSAGES = {
  sidebar: 'チーム管理',
  create: 'チームを新規作成',
  createSuccess: 'チームを作成しました',
  editTitle: 'チームの設定を編集',
  updateSuccess: 'チームを更新しました',
  deleteMenu: 'チームを削除',
  deleteSuccess: 'チームを削除しました',
  viewAndEdit: '閲覧・編集',
  noData: 'データがありません',
  tabUsers: '所属ユーザー',
  tabTemplates: '所属テンプレート',
  tabAssistants: '所属アシスタント',
  tabLabels: { users: '所属ユーザー', assistants: '所属アシスタント', templates: '所属テンプレート' },
  sortUpdated: '更新日時順',
  sortName: 'チーム名順',
  asc: '昇順',
  desc: '降順',
  // 所属ユーザー
  noUsers: 'ユーザーが見つかりません',
  addUser: 'ユーザーを追加',
  addUserSuccess: 'ユーザーをチームに追加しました',
  editRoleMenu: 'ユーザーの権限を編集',
  editRoleSuccess: '権限を更新しました',
  removeUserMenu: 'ユーザーを削除',
  removeUserTitle: '選択したユーザーをチームから削除します',
  removeUserSuccess: 'ユーザーをチームから削除しました',
  allRoles: '全ての権限',
  roleAdmin: 'チームの管理者',
  roleMember: '一般',
  sortAdded: '追加日時順',
  sortUserName: 'ユーザー表示名順',
  sortRole: '権限順',
  deselect: '選択を解除',
  removeSelected: '削除',
  // 所属テンプレート
  noTemplates: 'テンプレートがありません',
  addTemplate: 'テンプレートを追加',
  addTemplateSuccess: 'テンプレートをチームに追加しました',
  deleteTemplateTitle: '選択したテンプレートをチームから削除します',
  deleteTemplateSuccess: 'テンプレートをチームから削除しました',
  removeFromTeam: 'チームから削除',
  sortTemplateUpdated: '更新日時順',
  sortTemplateName: 'テンプレート名順',
  // 所属アシスタント
  noAssistants: 'アシスタントがありません',
  addAssistant: 'アシスタントを追加',
  addAssistantSuccess: 'アシスタントをチームに追加しました',
  deleteAssistantTitle: '選択したアシスタントをチームから削除します',
  deleteAssistantSuccess: 'アシスタントをチームから削除しました',
  allServers: '全ての接続サーバー',
  allCategories: '全てのカテゴリ',
  serverLocal: 'ローカル',
  serverCloudGeneral: 'クラウド(一般)',
  serverCloudSpecified: 'クラウド(学習先指定)',
  sortAssistantAdded: '追加日時順',
  sortAssistantName: 'アシスタント表示名順',
  sortAssistantServer: '接続サーバー順',
  sortAssistantCategory: 'カテゴリ順',
} as const;

export class TeamPage {
  readonly page: Page;
  readonly cards: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cards = page.getByTestId('admin-groups-list-card');
    this.searchInput = page.getByPlaceholder('検索ワードを入力');
  }

  /** チーム一覧を URL で開く。 */
  async gotoList(): Promise<void> {
    await this.page.goto(TEAM_LIST_PATH);
    await expect(this.page.getByTestId('admin-groups-create-button')).toBeVisible();
  }

  /** ユーザーメニューから管理コンソールに入り、サイドバーの「チーム管理」から開く。 */
  async openFromSidebar(): Promise<void> {
    await openAdminConsolePage(this.page, TEAM_MESSAGES.sidebar);
    await expect(this.page).toHaveURL(new RegExp(`${TEAM_LIST_PATH}$`));
    await expect(this.page.getByTestId('admin-groups-create-button')).toBeVisible();
  }

  /**
   * チーム詳細のタブを URL で開く。
   *
   * @param groupId チームの ID
   * @param tab 開くタブ
   */
  async gotoTab(groupId: string, tab: TeamTab = 'users'): Promise<void> {
    await this.page.goto(`${TEAM_LIST_PATH}/${groupId}/${tab}`);
    await expect(this.page.getByTestId('admin-groups-detail-menu-button')).toBeVisible();
  }

  /** チーム詳細のタブの並び（ヘッダーの tablist）。 */
  get tablist(): Locator {
    return this.page.getByRole('tablist');
  }

  /** 検索語を入れる（一覧・各タブ共通。デバウンスなしで反映される）。 */
  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
  }

  /**
   * チーム名でカードを探す。
   *
   * @param name チーム名
   * @returns カードのロケーター
   */
  card(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  /** 一覧のカードのチーム名を上から順に返す。 */
  async cardNames(): Promise<string[]> {
    return textsOf(this.cards, (card) => card.locator('.term-card-name'));
  }

  /** 件数表示（「1-5件 / 6件」）。 */
  get countDisplay(): Locator {
    return this.page.getByText(/^\d+-\d+件 \/ \d+件$/).first();
  }

  /** フィルター行（上）のページ送りの「次へ」。 */
  get topNext(): Locator {
    return this.page.getByRole('button', { name: 'Next page' }).first();
  }

  /** 一覧下部のページ送りの「次へ」。 */
  get bottomNext(): Locator {
    return this.page.getByRole('button', { name: 'Next page' }).last();
  }

  /**
   * 並べ替えを選ぶ。
   *
   * @param choice 並べ替え項目の文言と昇降
   */
  async chooseSort(choice: { field?: string; order?: string }): Promise<void> {
    await chooseSort(this.page.locator('.app-form-sort-input').first(), choice);
  }

  /** 「チームを新規作成」を押して、作成ダイアログを開く。 */
  async openCreateDialog(): Promise<Locator> {
    await this.page.getByTestId('admin-groups-create-button').click();
    const dialog = dialogOf(this.page, TEAM_MESSAGES.create);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /** 詳細ヘッダーの設定メニューを開いて項目を選ぶ。 */
  async detailMenu(testid: 'admin-groups-edit-name-button' | 'admin-groups-delete-button'): Promise<void> {
    await this.page.getByTestId('admin-groups-detail-menu-button').click();
    await this.page.getByTestId(testid).click();
  }

  /** 詳細ヘッダーのチーム名。 */
  get detailTitle(): Locator {
    return this.page.locator('h2').first();
  }

  /** タブの行（所属ユーザー・アシスタント・テンプレートで testid が違う）。 */
  rows(tab: TeamTab): Locator {
    const testid = { users: 'admin-groups-user-row', assistants: 'admin-groups-assistant-row', templates: 'admin-groups-template-row' }[tab];
    return this.page.getByTestId(testid);
  }

  /**
   * タブの行を文言（名前の一部）で探す。
   *
   * @param tab タブ
   * @param text 行に含まれる文言
   * @returns 行のロケーター
   */
  row(tab: TeamTab, text: string): Locator {
    return this.rows(tab).filter({ hasText: text });
  }

  /** タブの行の名前（表示名）を上から順に返す。 */
  async rowNames(tab: TeamTab): Promise<string[]> {
    return textsOf(this.rows(tab), (row) => row.locator('.table-list-title'));
  }

  /**
   * 行のチェックボックスを押す。
   *
   * @param row 行
   */
  async toggleRow(row: Locator): Promise<void> {
    await row.getByRole('checkbox').click();
  }

  /** 見出し行（全選択）のチェックボックス。PC の見出し行だけ。 */
  get selectAll(): Locator {
    return this.page.locator('.table-list-row--header').first().getByRole('checkbox');
  }

  /** ユーザー追加ダイアログ: 複数選択を開いてユーザーを選び、「決定」で閉じる。 */
  async pickUsersInDialog(dialog: Locator, names: string[]): Promise<void> {
    await dialog.locator('.app-multi-select').locator('[aria-haspopup="listbox"]').first().click();
    for (const name of names) {
      await dialog.getByRole('option').filter({ hasText: name }).first().click();
    }
    await dialog.getByRole('button', { name: '決定' }).click();
  }

  /** テンプレート・アシスタント追加ダイアログ: コンボボックスを開いて項目を選び、閉じる。 */
  async pickInCombobox(dialog: Locator, names: string[]): Promise<void> {
    await dialog.locator('[aria-expanded]').first().click();
    for (const name of names) {
      await dialog.getByText(name, { exact: true }).click();
    }
    await dialog.getByTestId('form-combobox-backdrop').click({ position: { x: 5, y: 5 } });
  }

  /** Select（接続サーバー・カテゴリ・権限）を選ぶ。 */
  async chooseSelect(index: number, label: string): Promise<void> {
    await chooseSelectOption(this.page.locator('.app-select').nth(index), label);
  }
}
