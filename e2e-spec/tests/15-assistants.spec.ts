import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { createAssistant, createCategory, SEED_GROUP_ID, type AssistantServerType } from '../src/api-service-settings.ts';
import { expect, test } from '../src/fixtures-service-settings.ts';
import { ASSISTANT_MESSAGES as M } from '../src/pages/assistants.page.ts';
import {
  bottomPager,
  COUNT_PATTERN,
  dataRows,
  filterRow,
  rowTitles,
  toast,
  topPager,
  waitForList,
} from '../src/pages/service-list-controls.ts';

/**
 * 15_アシスタント（48 項目）。項目書: 25DA61_結合テスト項目書_md/15_アシスタント.md
 *
 * 移植元との対応:
 * - 項番 17・18（サーバー種別順・カテゴリ順の並べ替え）は移植元で廃止済み（項目書の備考「このキーでのソートは廃止」）。
 *   並べ替えのメニューに出ないことを確かめる
 * - 項番 10〜12 のフィルターの文言は備考どおり「セキュア」「クラウド(一般)」「クラウド(学習先指定)」
 * - 項番 19 は備考どおり「履歴送信順」（移植元の画面の文言）
 * - 項番 23 の件数表示は備考どおり「開始-終了件 / 総数件」
 * - 項番 48（Chrome）は Playwright の Chromium（Chrome と同じエンジン）で確かめる
 * - 並列で他のテストも同じテナントを使うため、一覧の確認は「このテスト専用の接頭辞」で検索して絞り込んでから行う
 *   （カテゴリ管理タブには検索欄が無いので、自分で作ったカテゴリの相対的な位置で確かめる）
 */

test.describe.configure({ timeout: 120_000 });

const TEAM_NAME = '動作確認用グループ';
const MAX_ASSISTANT_NAME_LENGTH = 32;
const MAX_CATEGORY_NAME_LENGTH = 16;
/** アシスタント一覧の列の位置（接続サーバー・生成AIモデル・カテゴリ・所属チーム・履歴送信）。 */
const COLUMN = { server: 0, model: 1, category: 2, team: 3, history: 4 } as const;

/** 一覧の全行について、指定の列の表示文字列を取る。 */
async function columnTexts(page: Page, column: number): Promise<string[]> {
  return dataRows(page).evaluateAll(
    (rows, index) =>
      rows.map((row) => (row.querySelectorAll<HTMLElement>('.table-list-row-date')[index]?.innerText ?? '').trim()),
    column
  );
}

/** 3 種類の接続サーバーのアシスタントを、a・b・c の順に作る（履歴送信は a・c が ON、b が OFF）。 */
async function createThreeServers(adminApi: APIRequestContext, prefix: string): Promise<string[]> {
  const specs: { suffix: string; type: AssistantServerType; includeHistory: boolean }[] = [
    { suffix: 'a', type: 'SAAS_CHAT', includeHistory: true },
    { suffix: 'b', type: 'SECURE', includeHistory: false },
    { suffix: 'c', type: 'SAAS_RAG', includeHistory: true },
  ];
  const names: string[] = [];
  for (const spec of specs) {
    const name = `${prefix}-${spec.suffix}`;
    await createAssistant(adminApi, { name, type: spec.type, includeHistory: spec.includeHistory });
    names.push(name);
  }
  return names;
}

/** カテゴリを選ぶ複数選択（ComboboxMulti）で選択肢を 1 つ選ぶ。 */
async function chooseMulti(page: Page, dialog: Locator, label: string, optionName: string): Promise<void> {
  await dialog.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: optionName }).click();
  // 選択を確定する（閉じるだけでは取り消しになる）
  await page.getByRole('button', { name: '決定', exact: true }).click();
}

test.describe('15_アシスタント', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantAdmin');
  });

  test('[15-01] 画面表示', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await expect(page.getByRole('heading', { name: 'アシスタント', level: 2 })).toBeVisible();
    await expect(assistantsPage.assistantTab).toBeVisible();
    await expect(assistantsPage.categoryTab).toBeVisible();
  });

  test('[15-02] タブ切替', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await assistantsPage.categoryTab.click();
    await expect(page.getByRole('button', { name: M.createCategory })).toBeVisible();
    await expect(page.locator('.table-list-row--header').getByText('カテゴリ名', { exact: true })).toBeVisible();
    await assistantsPage.assistantTab.click();
    await expect(page.getByRole('button', { name: M.createAssistant })).toBeVisible();
    await expect(page.locator('.table-list-row--header').getByText('アシスタント表示名', { exact: true })).toBeVisible();
  });

  test('[15-03] アシスタント一覧表示', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await waitForList(page, M.assistantNoData);
    for (const column of ['アシスタント表示名', '接続サーバー', '生成AIモデル', 'カテゴリ', '所属チーム', '履歴送信']) {
      await expect(page.locator('.table-list-row--header').getByText(column, { exact: true })).toBeVisible();
    }
    await expect(dataRows(page).first()).toBeVisible();
  });

  test('[15-04] アシスタント新規作成', async ({ assistantsPage, page, prefix }) => {
    const name = `${prefix}-new`;
    await assistantsPage.goto();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.fillAssistantDialog({ name });
    await assistantsPage.confirmButton('作成').click();
    await expect(toast(page).filter({ hasText: M.createAssistantSuccess })).toBeVisible();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(name)).toHaveCount(1);
  });

  test('[15-05] 必須未入力（作成）', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.confirmButton('作成').click();
    // 表示名・接続サーバー・接続先・モデルが必須
    await expect(assistantsPage.dialog.getByText(M.required)).not.toHaveCount(0);
    await expect(assistantsPage.dialog.getByText(M.required).first()).toBeVisible();
    await expect(assistantsPage.dialog).toBeVisible();
  });

  test('[15-06] API未登録時', async ({ assistantsPage, page }) => {
    // 接続先 API が 1 件も登録されていないテナントを専用環境に作れないため、接続先一覧の API の応答を空にして、
    // 「API が未登録のとき」と同じ状態にする
    await page.route('**/api/admin/assistants/endpoints/**', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/assistants/AIModels**', (route) => route.fulfill({ json: [] }));
    await assistantsPage.goto();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.dialog.locator('label.input-radio', { hasText: M.serverCloudGeneral }).click();
    await assistantsPage.dialog.locator('#assistant-form-serverApi .trigger-wrapper').click();
    // 選択肢が 1 つも無い（接続先を選べない）
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('[15-07] アシスタント編集', async ({ assistantsPage, adminApi, page, prefix }) => {
    const created = await createAssistant(adminApi, { name: `${prefix}-before` });
    const afterName = `${prefix}-after`;
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(created.name)).toHaveCount(1);
    await assistantsPage.clickRowMenuItem(created.name, M.edit);
    await expect(assistantsPage.dialog).toBeVisible();
    await assistantsPage.nameInput.fill(afterName);
    await assistantsPage.confirmButton('保存').click();
    await expect(toast(page).filter({ hasText: M.updateAssistantSuccess })).toBeVisible();
    await expect(assistantsPage.row(afterName)).toHaveCount(1);
    await expect(assistantsPage.row(created.name)).toHaveCount(0);
  });

  test('[15-08] アシスタント削除（個別）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const created = await createAssistant(adminApi, { name: `${prefix}-del` });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(created.name)).toHaveCount(1);
    await assistantsPage.clickRowMenuItem(created.name, M.delete);
    await expect(assistantsPage.dialog.getByText(M.deleteAssistantTitle)).toBeVisible();
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(toast(page).filter({ hasText: M.deleteAssistantSuccess })).toBeVisible();
    await expect(assistantsPage.row(created.name)).toHaveCount(0);
  });

  test('[15-09] サーバーフィルター（すべて）', async ({ assistantsPage, adminApi, page, prefix }) => {
    await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await expect(assistantsPage.serverFilter).toContainText(M.allServers);
    await assistantsPage.search(prefix);
    // 3 種類のサーバーのアシスタントがすべて表示される
    await expect.poll(() => columnTexts(page, COLUMN.server)).toEqual(
      expect.arrayContaining([M.serverSecure, M.serverCloudGeneral, M.serverCloudRag])
    );
    await expect(dataRows(page)).toHaveCount(3);
  });

  for (const [id, label] of [
    ['10', M.serverSecure],
    ['11', M.serverCloudGeneral],
    ['12', M.serverCloudRag],
  ] as const) {
    test(`[15-${id}] サーバーフィルター（${label}）`, async ({ assistantsPage, adminApi, page, prefix }) => {
      await createThreeServers(adminApi, prefix);
      await assistantsPage.goto();
      await assistantsPage.search(prefix);
      await expect(dataRows(page)).toHaveCount(3);
      await assistantsPage.choose(assistantsPage.serverFilter, label);
      await expect(dataRows(page)).toHaveCount(1);
      expect(await columnTexts(page, COLUMN.server)).toEqual([label]);
    });
  }

  test('[15-13] カテゴリフィルター', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-c1`);
    await createAssistant(adminApi, { name: `${prefix}-with`, categoryIds: [category.id] });
    await createAssistant(adminApi, { name: `${prefix}-none` });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(2);
    await assistantsPage.choose(assistantsPage.categoryFilter, category.name);
    await expect(dataRows(page)).toHaveCount(1);
    expect(await rowTitles(page)).toEqual([`${prefix}-with`]);
  });

  test('[15-14] チームフィルター', async ({ assistantsPage, adminApi, page, prefix }) => {
    await createAssistant(adminApi, { name: `${prefix}-team`, groups: [SEED_GROUP_ID] });
    await createAssistant(adminApi, { name: `${prefix}-solo` });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(2);
    await assistantsPage.choose(assistantsPage.teamFilter, TEAM_NAME);
    await expect(dataRows(page)).toHaveCount(1);
    expect(await rowTitles(page)).toEqual([`${prefix}-team`]);
  });

  test('[15-15] 並替（更新日時）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.sortBy(M.sortUpdatedAt);
    await assistantsPage.sortBy(M.desc);
    // 新しい順（最後に作った c が先頭）
    await expect.poll(() => rowTitles(page)).toEqual([...names].reverse());
  });

  test('[15-16] 並替（表示名）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.sortBy(M.sortDisplayName);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(() => rowTitles(page)).toEqual(names);
  });

  test('[15-17] 並替（サーバー種別）', async ({ assistantsPage }) => {
    // 移植元で廃止済み（備考「このキーでのソートは廃止」）。並べ替えのメニューに無いことを確かめる
    await assistantsPage.goto();
    await assistantsPage.sortTrigger.click();
    await expect(assistantsPage.page.getByRole('menuitemradio', { name: M.sortUpdatedAt })).toBeVisible();
    await expect(assistantsPage.page.getByRole('menuitemradio', { name: /サーバー種別/ })).toHaveCount(0);
  });

  test('[15-18] 並替（カテゴリ）', async ({ assistantsPage }) => {
    // 移植元で廃止済み（備考「このキーでのソートは廃止」）。並べ替えのメニューに無いことを確かめる
    await assistantsPage.goto();
    await assistantsPage.sortTrigger.click();
    await expect(assistantsPage.page.getByRole('menuitemradio', { name: M.sortUpdatedAt })).toBeVisible();
    await expect(assistantsPage.page.getByRole('menuitemradio', { name: /カテゴリ順/ })).toHaveCount(0);
  });

  test('[15-19] 並替（履歴共有）', async ({ assistantsPage, adminApi, page, prefix }) => {
    await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    // 備考: 画面の文言は「履歴共有順」ではなく「履歴送信順」
    await assistantsPage.sortBy(M.sortHistory);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(() => columnTexts(page, COLUMN.history)).toEqual(['OFF', 'ON', 'ON']);
    await assistantsPage.sortBy(M.desc);
    await expect.poll(() => columnTexts(page, COLUMN.history)).toEqual(['ON', 'ON', 'OFF']);
  });

  test('[15-20] 並替（昇順/降順）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.sortBy(M.sortDisplayName);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(() => rowTitles(page)).toEqual(names);
    await assistantsPage.sortBy(M.desc);
    await expect.poll(() => rowTitles(page)).toEqual([...names].reverse());
  });

  test('[15-21] ページ送り（上部）', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await waitForList(page, M.assistantNoData);
    const firstPage = await rowTitles(page);
    await topPager(page, 'Next page').click();
    await expect.poll(async () => (await rowTitles(page))[0]).not.toBe(firstPage[0]);
    await expect(filterRow(page)).toContainText(/11-\d+件 \/ \d+件/);
  });

  test('[15-22] ページ送り（下部）', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await waitForList(page, M.assistantNoData);
    const firstPage = await rowTitles(page);
    await bottomPager(page, 'Next page').click();
    await expect.poll(async () => (await rowTitles(page))[0]).not.toBe(firstPage[0]);
    await expect(filterRow(page)).toContainText(/11-\d+件 \/ \d+件/);
  });

  test('[15-23] 件数表示', async ({ assistantsPage, page }) => {
    await assistantsPage.goto();
    await waitForList(page, M.assistantNoData);
    // 備考: 「⚪︎-⚪︎件 / ⚪︎件」の形
    await expect(filterRow(page)).toContainText(COUNT_PATTERN);
    const text = await filterRow(page).innerText();
    const match = COUNT_PATTERN.exec(text);
    expect(match?.[1]).toBe('1');
    expect(Number(match?.[2])).toBeLessThanOrEqual(Number(match?.[3]));
  });

  test('[15-24] 一括選択', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.checkRow(names[0]);
    await assistantsPage.checkRow(names[1]);
    await expect(page.getByRole('button', { name: M.clearSelection })).toBeVisible();
    await expect(page.getByRole('button', { name: M.delete, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: M.createAssistant })).toHaveCount(0);
  });

  test('[15-25] 一括削除', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.checkRow(names[0]);
    await assistantsPage.checkRow(names[1]);
    await page.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(assistantsPage.dialog.getByText(M.deleteAssistantTitle)).toBeVisible();
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(toast(page).filter({ hasText: M.deleteAssistantSuccess })).toBeVisible();
    await expect.poll(() => rowTitles(page)).toEqual([names[2]]);
  });

  test('[15-26] 全選択', async ({ assistantsPage, adminApi, page, prefix }) => {
    await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.headerCheckbox.click();
    const checkboxes = dataRows(page).locator('.table-list-checkbox input[type=checkbox]');
    await expect(checkboxes).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(checkboxes.nth(i)).toBeChecked();
  });

  test('[15-27] 選択解除', async ({ assistantsPage, adminApi, page, prefix }) => {
    const names = await createThreeServers(adminApi, prefix);
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.checkRow(names[0]);
    await page.getByRole('button', { name: M.clearSelection }).click();
    const checkboxes = dataRows(page).locator('.table-list-checkbox input[type=checkbox]');
    for (let i = 0; i < 3; i++) await expect(checkboxes.nth(i)).not.toBeChecked();
    await expect(page.getByRole('button', { name: M.createAssistant })).toBeVisible();
  });

  test('[15-28] アシスタント0件', async ({ assistantsPage, page, uniqueId }) => {
    // 専用環境のテナントのアシスタントを 0 件にはできないので、該当なしの検索で 0 件の状態にする
    await assistantsPage.goto();
    await assistantsPage.search(uniqueId('none'));
    await expect(page.getByText(M.assistantNoData)).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
  });

  test('[15-29] カテゴリ一覧表示', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-d`, `${prefix} の説明`);
    await assistantsPage.gotoCategoryTab();
    await waitForList(page, M.categoryNoData);
    const header = page.locator('.table-list-row--header');
    await expect(header.getByText('更新日時', { exact: true })).toBeVisible();
    await expect(header.getByText('カテゴリ名', { exact: true })).toBeVisible();
    const row = assistantsPage.row(category.name);
    await expect(row).toHaveCount(1);
    // 更新日時（yyyy/MM/dd HH:mm）・カテゴリ名・説明が出る
    await expect(row).toContainText(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/);
    await expect(row).toContainText(`${prefix} の説明`);
  });

  test('[15-30] カテゴリ新規作成', async ({ assistantsPage, page, prefix }) => {
    const name = `${prefix}-n`;
    await assistantsPage.gotoCategoryTab();
    await page.getByRole('button', { name: M.createCategory }).click();
    await assistantsPage.dialog.getByPlaceholder('カテゴリの名前を入力').fill(name);
    await assistantsPage.dialog.getByPlaceholder('カテゴリの説明を入力').fill('E2E の説明');
    await assistantsPage.confirmButton('作成').click();
    await expect(toast(page).filter({ hasText: M.createCategorySuccess })).toBeVisible();
    await expect(assistantsPage.row(name)).toHaveCount(1);
  });

  test('[15-31] 必須未入力（カテゴリ）', async ({ assistantsPage, page }) => {
    await assistantsPage.gotoCategoryTab();
    await page.getByRole('button', { name: M.createCategory }).click();
    await assistantsPage.confirmButton('作成').click();
    await expect(assistantsPage.dialog.getByText(M.required).first()).toBeVisible();
    await expect(assistantsPage.dialog).toBeVisible();
  });

  test('[15-32] カテゴリ編集', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-e1`, '編集前の説明');
    await assistantsPage.gotoCategoryTab();
    await assistantsPage.clickRowMenuItem(category.name, M.editCategoryTitle);
    await assistantsPage.dialog.getByPlaceholder('カテゴリの名前を入力').fill(`${prefix}-e2`);
    await assistantsPage.dialog.getByPlaceholder('カテゴリの説明を入力').fill('編集後の説明');
    await assistantsPage.confirmButton('保存').click();
    await expect(toast(page).filter({ hasText: M.updateCategorySuccess })).toBeVisible();
    const row = assistantsPage.row(`${prefix}-e2`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('編集後の説明');
    await expect(assistantsPage.row(category.name)).toHaveCount(0);
  });

  test('[15-33] カテゴリ削除（個別）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-x`);
    await assistantsPage.gotoCategoryTab();
    await expect(assistantsPage.row(category.name)).toHaveCount(1);
    await assistantsPage.clickRowMenuItem(category.name, M.delete);
    await expect(assistantsPage.dialog.getByText(M.deleteCategoryTitle)).toBeVisible();
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(toast(page).filter({ hasText: M.deleteCategorySuccess })).toBeVisible();
    await expect(assistantsPage.row(category.name)).toHaveCount(0);
  });

  test('[15-34] カテゴリ並替（更新日時）', async ({ assistantsPage, adminApi, page, prefix }) => {
    const older = await createCategory(adminApi, `${prefix}-o`);
    const newer = await createCategory(adminApi, `${prefix}-p`);
    await assistantsPage.gotoCategoryTab();
    await waitForList(page, M.categoryNoData);
    await assistantsPage.sortBy(M.sortUpdatedAt);
    await assistantsPage.sortBy(M.desc);
    // 新しい順。自分で作った 2 件の前後関係で確かめる（カテゴリ管理タブに検索欄は無い）
    await expect.poll(async () => {
      const titles = await rowTitles(page);
      return titles.indexOf(newer.name) >= 0 && titles.indexOf(newer.name) < titles.indexOf(older.name);
    }).toBe(true);
  });

  test('[15-35] カテゴリ並替（カテゴリ名）', async ({ assistantsPage, page }) => {
    await assistantsPage.gotoCategoryTab();
    await waitForList(page, M.categoryNoData);
    await assistantsPage.sortBy(M.sortCategoryName);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(async () => {
      const titles = await rowTitles(page);
      return JSON.stringify(titles) === JSON.stringify([...titles].sort());
    }).toBe(true);
  });

  test('[15-36] カテゴリ並替（昇順/降順）', async ({ assistantsPage, page }) => {
    await assistantsPage.gotoCategoryTab();
    await waitForList(page, M.categoryNoData);
    await assistantsPage.sortBy(M.sortCategoryName);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(async () => {
      const titles = await rowTitles(page);
      return JSON.stringify(titles) === JSON.stringify([...titles].sort());
    }).toBe(true);
    await assistantsPage.sortBy(M.desc);
    await expect.poll(async () => {
      const titles = await rowTitles(page);
      return JSON.stringify(titles) === JSON.stringify([...titles].sort().reverse());
    }).toBe(true);
  });

  test('[15-37] カテゴリページ送り', async ({ assistantsPage, page }) => {
    await assistantsPage.gotoCategoryTab();
    await waitForList(page, M.categoryNoData);
    const firstPage = await rowTitles(page);
    await topPager(page, 'Next page').click();
    await expect.poll(async () => (await rowTitles(page))[0]).not.toBe(firstPage[0]);
    await expect(filterRow(page)).toContainText(/11-\d+件 \/ \d+件/);
  });

  test('[15-38] カテゴリ一括選択', async ({ assistantsPage, adminApi, page, prefix }) => {
    const first = await createCategory(adminApi, `${prefix}-1`);
    const second = await createCategory(adminApi, `${prefix}-2`);
    await assistantsPage.gotoCategoryTab();
    await expect(assistantsPage.row(first.name)).toHaveCount(1);
    await assistantsPage.checkRow(first.name);
    await assistantsPage.checkRow(second.name);
    await expect(page.getByRole('button', { name: M.clearSelection })).toBeVisible();
    await expect(page.getByRole('button', { name: M.delete, exact: true })).toBeVisible();
  });

  test('[15-39] カテゴリ一括削除', async ({ assistantsPage, adminApi, page, prefix }) => {
    const first = await createCategory(adminApi, `${prefix}-1`);
    const second = await createCategory(adminApi, `${prefix}-2`);
    await assistantsPage.gotoCategoryTab();
    await expect(assistantsPage.row(first.name)).toHaveCount(1);
    await assistantsPage.checkRow(first.name);
    await assistantsPage.checkRow(second.name);
    await page.getByRole('button', { name: M.delete, exact: true }).click();
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(toast(page).filter({ hasText: M.deleteCategorySuccess })).toBeVisible();
    await expect(assistantsPage.row(first.name)).toHaveCount(0);
    await expect(assistantsPage.row(second.name)).toHaveCount(0);
  });

  test('[15-40] カテゴリ0件', async ({ assistantsPage, page }) => {
    // 専用環境のテナントのカテゴリを 0 件にはできない（他のテストが使う）ため、カテゴリ一覧の API の応答を空にして 0 件の状態にする
    await page.route('**/api/admin/assistant-categories', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue()
    );
    await assistantsPage.gotoCategoryTab();
    await expect(page.getByText(M.categoryNoData)).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
  });

  test('[15-41] カテゴリ作成→アシスタント紐付', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-k`);
    const existing = await createAssistant(adminApi, { name: `${prefix}-old` });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    // 作成で紐付ける
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.fillAssistantDialog({ name: `${prefix}-new` });
    await chooseMulti(page, assistantsPage.dialog, 'カテゴリ', category.name);
    await assistantsPage.confirmButton('作成').click();
    await expect(toast(page).filter({ hasText: M.createAssistantSuccess })).toBeVisible();
    await expect(assistantsPage.row(`${prefix}-new`)).toContainText(category.name);
    // 編集で紐付ける
    await assistantsPage.clickRowMenuItem(existing.name, M.edit);
    await chooseMulti(page, assistantsPage.dialog, 'カテゴリ', category.name);
    await assistantsPage.confirmButton('保存').click();
    await expect(toast(page).filter({ hasText: M.updateAssistantSuccess })).toBeVisible();
    await expect(assistantsPage.row(existing.name)).toContainText(category.name);
  });

  test('[15-42] サーバー＋カテゴリフィルター', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-k`);
    await createAssistant(adminApi, { name: `${prefix}-hit`, type: 'SAAS_CHAT', categoryIds: [category.id] });
    await createAssistant(adminApi, { name: `${prefix}-other-server`, type: 'SECURE', categoryIds: [category.id] });
    await createAssistant(adminApi, { name: `${prefix}-other-category`, type: 'SAAS_CHAT' });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.choose(assistantsPage.serverFilter, M.serverCloudGeneral);
    await assistantsPage.choose(assistantsPage.categoryFilter, category.name);
    await expect.poll(() => rowTitles(page)).toEqual([`${prefix}-hit`]);
  });

  test('[15-43] サーバー＋チームフィルター', async ({ assistantsPage, adminApi, page, prefix }) => {
    await createAssistant(adminApi, { name: `${prefix}-hit`, type: 'SAAS_CHAT', groups: [SEED_GROUP_ID] });
    await createAssistant(adminApi, { name: `${prefix}-other-server`, type: 'SECURE', groups: [SEED_GROUP_ID] });
    await createAssistant(adminApi, { name: `${prefix}-other-team`, type: 'SAAS_CHAT' });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await expect(dataRows(page)).toHaveCount(3);
    await assistantsPage.choose(assistantsPage.serverFilter, M.serverCloudGeneral);
    await assistantsPage.choose(assistantsPage.teamFilter, TEAM_NAME);
    await expect.poll(() => rowTitles(page)).toEqual([`${prefix}-hit`]);
  });

  test('[15-44] フィルター＋並べ替え', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-k`);
    await createAssistant(adminApi, { name: `${prefix}-b`, categoryIds: [category.id] });
    await createAssistant(adminApi, { name: `${prefix}-a`, categoryIds: [category.id] });
    await createAssistant(adminApi, { name: `${prefix}-z` });
    await assistantsPage.goto();
    await assistantsPage.search(prefix);
    await assistantsPage.choose(assistantsPage.categoryFilter, category.name);
    await expect(dataRows(page)).toHaveCount(2);
    await assistantsPage.sortBy(M.sortDisplayName);
    await assistantsPage.sortBy(M.asc);
    await expect.poll(() => rowTitles(page)).toEqual([`${prefix}-a`, `${prefix}-b`]);
    await assistantsPage.sortBy(M.desc);
    await expect.poll(() => rowTitles(page)).toEqual([`${prefix}-b`, `${prefix}-a`]);
  });

  test('[15-45] 2タブ連続CRUD', async ({ assistantsPage, page, prefix }) => {
    const categoryName = `${prefix}-k`;
    const assistantName = `${prefix}-as`;
    // カテゴリタブで作成
    await assistantsPage.gotoCategoryTab();
    await page.getByRole('button', { name: M.createCategory }).click();
    await assistantsPage.dialog.getByPlaceholder('カテゴリの名前を入力').fill(categoryName);
    await assistantsPage.confirmButton('作成').click();
    await expect(assistantsPage.row(categoryName)).toHaveCount(1);
    // アシスタントタブで、そのカテゴリを紐付けて作成
    await assistantsPage.assistantTab.click();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.fillAssistantDialog({ name: assistantName });
    await chooseMulti(page, assistantsPage.dialog, 'カテゴリ', categoryName);
    await assistantsPage.confirmButton('作成').click();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(assistantName)).toContainText(categoryName);
    // カテゴリを削除すると、カテゴリ一覧から消え、アシスタントからも消える（アシスタントは残る）
    await assistantsPage.categoryTab.click();
    await assistantsPage.clickRowMenuItem(categoryName, M.delete);
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(assistantsPage.row(categoryName)).toHaveCount(0);
    await assistantsPage.assistantTab.click();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(assistantName)).toHaveCount(1);
    await expect(assistantsPage.row(assistantName)).not.toContainText(categoryName);
    // アシスタントも削除する
    await assistantsPage.clickRowMenuItem(assistantName, M.delete);
    await assistantsPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    await expect(assistantsPage.row(assistantName)).toHaveCount(0);
  });

  test('[15-46] 表示名最大長', async ({ assistantsPage, page, prefix }) => {
    // アシスタントは 32 文字、カテゴリは 16 文字（備考）
    const assistantName = `${prefix}-${'x'.repeat(MAX_ASSISTANT_NAME_LENGTH)}`.slice(0, MAX_ASSISTANT_NAME_LENGTH);
    const categoryName = `${prefix}${'y'.repeat(MAX_CATEGORY_NAME_LENGTH)}`.slice(0, MAX_CATEGORY_NAME_LENGTH);
    expect(assistantName).toHaveLength(MAX_ASSISTANT_NAME_LENGTH);
    expect(categoryName).toHaveLength(MAX_CATEGORY_NAME_LENGTH);

    await assistantsPage.goto();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.fillAssistantDialog({ name: assistantName });
    await assistantsPage.confirmButton('作成').click();
    await expect(toast(page).filter({ hasText: M.createAssistantSuccess })).toBeVisible();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(assistantName)).toHaveCount(1);

    await assistantsPage.categoryTab.click();
    await page.getByRole('button', { name: M.createCategory }).click();
    await assistantsPage.dialog.getByPlaceholder('カテゴリの名前を入力').fill(categoryName);
    await assistantsPage.confirmButton('作成').click();
    await expect(toast(page).filter({ hasText: M.createCategorySuccess })).toBeVisible();
    await expect(assistantsPage.row(categoryName)).toHaveCount(1);
  });

  test('[15-47] フィルター0件', async ({ assistantsPage, adminApi, page, prefix }) => {
    const category = await createCategory(adminApi, `${prefix}-k`);
    await assistantsPage.goto();
    await assistantsPage.choose(assistantsPage.categoryFilter, category.name);
    await expect(page.getByText(M.assistantNoData)).toBeVisible();
    await expect(dataRows(page)).toHaveCount(0);
  });

  test('[15-48] アシスタント Chrome', async ({ assistantsPage, page, prefix, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    const categoryName = `${prefix}-k`;
    await assistantsPage.gotoCategoryTab();
    await page.getByRole('button', { name: M.createCategory }).click();
    await assistantsPage.dialog.getByPlaceholder('カテゴリの名前を入力').fill(categoryName);
    await assistantsPage.confirmButton('作成').click();
    await expect(assistantsPage.row(categoryName)).toHaveCount(1);
    await assistantsPage.assistantTab.click();
    await page.getByRole('button', { name: M.createAssistant }).click();
    await assistantsPage.fillAssistantDialog({ name: `${prefix}-chrome` });
    await assistantsPage.confirmButton('作成').click();
    await assistantsPage.search(prefix);
    await expect(assistantsPage.row(`${prefix}-chrome`)).toHaveCount(1);
  });
});
