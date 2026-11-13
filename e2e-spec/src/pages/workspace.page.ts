import { expect, type Locator, type Page } from '@playwright/test';
import { dialogOf, openAdminConsolePage } from './admin-widgets.ts';

/** ワークスペース設定画面（/admin/tenant）の Page Object。利用状況・API 設定の 2 タブ。 */

export const WORKSPACE_PATH = '/admin/tenant';

/** 画面の文言（public/i18n/ja.json の TENANT.*。API の追加ダイアログの文言は移植元でもハードコード）。 */
export const WORKSPACE_MESSAGES = {
  sidebar: 'ワークスペース設定',
  tabUsage: '利用状況',
  tabApi: 'API設定',
  planInfo: '利用プラン情報',
  contractPlan: '契約中のコース',
  periodTotal: '請求期間内の利用合計',
  monthlyHistory: '今月の利用履歴',
  configuredApi: '設定済みのAPI',
  addApi: 'APIを追加',
  addApiTitle: 'APIを新規作成',
  editApiTitle: 'APIの設定を編集',
  menuEditApi: 'APIの設定を編集',
  menuDeleteApi: 'APIを削除',
  deleteApiTitle: '選択したAPIを削除します',
  renameTitle: 'ワークスペースの名前を変更',
  renameSuccess: 'ワークスペース名を更新しました',
  addSuccess: 'APIを追加しました',
  updateSuccess: 'APIを更新しました',
  deleteSuccess: 'APIを削除しました',
  createEndpointFailed: 'エンドポイントの作成に失敗しました',
  nameLabelInput: 'APIの表示名を入力',
  urlLabelInput: '接続先のURLを入力',
} as const;

/** ワークスペース名の最大長（backend の tenantName の上限と、テナント名の DB カラム）。 */
export const TENANT_NAME_MAX_LENGTH = 32;

export class WorkspacePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly tablist: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h2').first();
    this.tablist = page.getByRole('tablist');
  }

  /** ワークスペース設定を URL で開く。 */
  async goto(query = ''): Promise<void> {
    await this.page.goto(`${WORKSPACE_PATH}${query}`);
    await expect(this.tablist).toBeVisible();
  }

  /** ユーザーメニューから管理コンソールに入り、サイドバーの「ワークスペース設定」から開く。 */
  async openFromSidebar(): Promise<void> {
    await openAdminConsolePage(this.page, WORKSPACE_MESSAGES.sidebar);
    await expect(this.page).toHaveURL(new RegExp(`${WORKSPACE_PATH}`));
    await expect(this.tablist).toBeVisible();
  }

  /**
   * タブを切り替える。
   *
   * @param label タブの文言
   */
  async selectTab(label: string): Promise<void> {
    await this.tablist.getByText(label, { exact: true }).click();
  }

  /** 見出し横の鉛筆ボタンから「ワークスペースの名前を変更」ダイアログを開く。 */
  async openRenameDialog(): Promise<Locator> {
    await this.heading.locator('xpath=following-sibling::button').click();
    const dialog = dialogOf(this.page, WORKSPACE_MESSAGES.renameTitle);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /** API 設定タブの「設定済みのAPI」の行。 */
  get apiRows(): Locator {
    return this.page.getByTestId('tenant-api-row');
  }

  /**
   * API 設定タブの行を表示名で探す。
   *
   * @param name API の表示名
   * @returns 行のロケーター
   */
  apiRow(name: string): Locator {
    return this.apiRows.filter({ hasText: name });
  }

  /** 「APIを追加」を押して、追加ダイアログを開く。 */
  async openAddApiDialog(): Promise<Locator> {
    await this.page.getByTestId('tenant-add-api-button').click();
    const dialog = dialogOf(this.page, WORKSPACE_MESSAGES.addApiTitle);
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /**
   * 追加・編集ダイアログの入力欄に値を入れる。API キーは「生成」を押して作る。
   *
   * @param dialog ダイアログ
   * @param values name: 表示名、url: 接続先 URL、generateKey: API キーを生成するか
   */
  async fillApiDialog(dialog: Locator, values: { name?: string; url?: string; generateKey?: boolean }): Promise<void> {
    if (values.name !== undefined) await dialog.getByTestId('tenant-api-name-input').fill(values.name);
    if (values.url !== undefined) await dialog.getByTestId('tenant-api-url-input').fill(values.url);
    if (values.generateKey) {
      await dialog.getByTestId('tenant-api-generate-button').click();
      await expect(dialog.getByTestId('tenant-api-key-input')).not.toHaveValue('');
    }
  }

  /**
   * API 行の歯車メニューを開き、項目を選ぶ。
   *
   * @param name API の表示名
   * @param testid 押す項目の data-testid（編集 `tenant-api-edit-button` / 削除 `tenant-api-delete-button`）
   */
  async rowMenu(name: string, testid: 'tenant-api-edit-button' | 'tenant-api-delete-button'): Promise<void> {
    await this.apiRow(name).getByTestId('tenant-api-row-menu-button').click();
    await this.page.getByTestId(testid).click();
  }
}
