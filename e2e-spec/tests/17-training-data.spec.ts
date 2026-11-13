import type { APIRequestContext, Page } from '@playwright/test';
import type { LoginPage } from '../src/pages/login.page.ts';
import type { TrainingDataPage } from '../src/pages/training-data.page.ts';
import {
  createFile,
  createFolder,
  createTenantEndpoint,
  deleteTenantEndpoint,
  SEED_CLOUD_FOLDER_ID,
  SEED_CLOUD_FOLDER_NAME,
  SEED_EMPTY_FOLDER_ID,
  SEED_EMPTY_FOLDER_NAME,
  SEED_LOCAL_FOLDER_ID,
  SEED_LOCAL_FOLDER_NAME,
  type CreatedFolder,
} from '../src/api-service-settings.ts';
import { loginApi } from '../src/api.ts';
import { createQuotaTenant, dropQuotaTenant, type QuotaScenario } from '../src/db-quota.ts';
import { expect, test } from '../src/fixtures-service-settings.ts';
import {
  bottomPager,
  chooseCustomPeriod,
  COUNT_PATTERN,
  filterRow,
  groupOrder,
  topPager,
} from '../src/pages/service-list-controls.ts';
import { FILE_COLUMN, TRAINING_DATA_PATH, TRAINING_MESSAGES as M, TRAINING_PERIOD_PREFIX } from '../src/pages/training-data.page.ts';
import { TENANT_ID } from '../src/users.ts';

/**
 * 17_学習データ（47 項目）。項目書: 25DA61_結合テスト項目書_md/17_学習データ.md
 *
 * 移植元との対応:
 * - 専用環境にはローカル API サーバー（Waha! Transformer）が無い。ローカル接続のフォルダでデータの追加・編集・削除・一括同期を
 *   すると「ローカルAPIサーバへのリクエストを処理できません。」になるため、項番 6〜9 は未実施（skip）にする。
 *   一覧・フィルター・並べ替え・ページ送りなどローカルとクラウドで同じ画面の項目は、データのあるクラウドのフォルダで確かめる
 *   （seed.sql の「学習データ確認用ローカルフォルダ」は 0 件で、データは「学習データ確認用クラウドフォルダ」に入っている）
 * - 読むだけの項目は seed のフォルダ、データを増減する項目は、テストごとに作るフォルダ（名前に専用の接頭辞）で確かめる
 * - 項番 37（Chrome）は Playwright の Chromium（Chrome と同じエンジン）で確かめる
 */

test.describe.configure({ timeout: 120_000 });

const USER_NAME = 'ユーザー1';
const ADMIN_NAME = '管理者';
const FOLDER_NAME_MAX_LENGTH = 255;
const PAGE_SIZE = 10;
const SEED_FILE_COUNT = 11;
const LOCAL_SERVER_REASON =
  '専用環境にローカル API サーバー（Waha! Transformer）が無く、ローカル接続のフォルダでデータを操作すると「ローカルAPIサーバへのリクエストを処理できません。」になるため';

/** seed のクラウドフォルダのデータの表示名（ファイル01〜11）。 */
function seedFileName(n: number): string {
  return `学習データ確認用ファイル${String(n).padStart(2, '0')}`;
}

/** クラウドの学習先フォルダを API で作り、中に学習データを（指定の順に）追加する。 */
async function makeFolder(
  adminApi: APIRequestContext,
  prefix: string,
  fileSuffixes: string[] = []
): Promise<{ folder: CreatedFolder; names: string[] }> {
  const folder = await createFolder(adminApi, `${prefix}-fld`, 'SAAS_GLOBAL');
  const names: string[] = [];
  for (const suffix of fileSuffixes) {
    const name = `${prefix}-${suffix}`;
    await createFile(adminApi, folder.id, name);
    names.push(name);
  }
  return { folder, names };
}

/** 学習先フォルダの一覧で、フォルダ名で絞り込み、「閲覧・編集」でフォルダの詳細を開く。 */
async function openFolder(page: Page, folderName: string): Promise<void> {
  await page.getByPlaceholder('検索ワードを入力').fill(folderName);
  // 絞り込んだ結果が 1 件になってから開く（フォルダの一覧の行は table-list の行ではない）
  const openButton = page.getByRole('button', { name: '閲覧・編集' });
  await expect(openButton).toHaveCount(1);
  await openButton.click();
}

test.describe('17_学習データ', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantAdmin');
  });

  test('[17-01] 詳細ヘッダー表示', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await expect(trainingDataPage.backLink).toBeVisible();
    await expect(trainingDataPage.folderMenuButton).toBeVisible();
    await trainingDataPage.folderMenuButton.click();
    await expect(page.getByRole('menuitem', { name: M.menuEditFolder })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: M.menuDeleteFolder })).toBeVisible();
  });

  test('[17-02] フォルダ名編集', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder } = await makeFolder(adminApi, prefix);
    const newName = `${prefix}-renamed`;
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.clickFolderMenu(M.menuEditFolder);
    await expect(trainingDataPage.dialog).toBeVisible();
    await trainingDataPage.dialog.getByPlaceholder('学習先フォルダの名前を入力').fill(newName);
    await trainingDataPage.dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(trainingDataPage.heading).toHaveText(newName);
    await expect(page.getByText(folder.name, { exact: true })).toHaveCount(0);
  });

  test('[17-03] フォルダ削除', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder } = await makeFolder(adminApi, prefix);
    // 削除のあとは「前の画面」に戻る（移植元は location.back()）ので、一覧からフォルダを開く
    await trainingDataPage.gotoList();
    await openFolder(page, folder.name);
    await expect(trainingDataPage.heading).toHaveText(folder.name);
    await trainingDataPage.clickFolderMenu(M.menuDeleteFolder);
    await expect(trainingDataPage.dialog.getByText(M.deleteFolderConfirmTitle)).toBeVisible();
    await trainingDataPage.dialog.getByRole('button', { name: M.delete, exact: true }).click();
    // 一覧画面に戻り、フォルダが無くなる
    await expect(page).toHaveURL(new RegExp(`${TRAINING_DATA_PATH}$`));
    await expect
      .poll(async () => {
        const res = await adminApi.get('/api/admin/indexes', { params: { searchText: prefix } });
        return ((await res.json()) as { content: unknown[] }).content.length;
      })
      .toBe(0);
  });

  test('[17-04] 戻る操作', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.backLink.click();
    await expect(page).toHaveURL(new RegExp(`${TRAINING_DATA_PATH}$`));
    await expect(page.getByRole('button', { name: M.createFolder })).toBeVisible();
  });

  test('[17-05] ローカル詳細表示', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_LOCAL_FOLDER_ID, SEED_LOCAL_FOLDER_NAME);
    // ローカル用の説明と一括同期ボタンが出る
    await expect(page.getByText(M.localInfoTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: M.bulkSync })).toBeVisible();
  });

  test('[17-06] データ追加（ローカル）', async () => {
    test.skip(true, LOCAL_SERVER_REASON);
  });

  test('[17-07] データ編集（ローカル）', async () => {
    test.skip(true, LOCAL_SERVER_REASON);
  });

  test('[17-08] データ削除（個別）', async () => {
    test.skip(true, LOCAL_SERVER_REASON);
  });

  test('[17-09] 一括同期', async () => {
    test.skip(true, `${LOCAL_SERVER_REASON}（一括同期はローカル API サーバーのデータを取り込む操作）`);
  });

  test('[17-10] 詳細検索', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.search(seedFileName(5));
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([seedFileName(5)]);
  });

  test('[17-11] 詳細ユーザーフィルター', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.chooseUser(USER_NAME);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([seedFileName(3)]);
    expect(await trainingDataPage.columnTexts(FILE_COLUMN.updatedBy)).toEqual([USER_NAME]);
  });

  test('[17-12] 詳細期間（今日）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['today']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.choosePeriod(M.today);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual(names);
    // 40 日前に更新したデータ（seed のファイル10）は出ない
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.choosePeriod(M.today);
    await trainingDataPage.search(seedFileName(10));
    await expect(trainingDataPage.rows).toHaveCount(0);
  });

  test('[17-13] 詳細期間（7日）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['recent']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.choosePeriod(M.past7days);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual(names);
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.choosePeriod(M.past7days);
    await trainingDataPage.search(seedFileName(10));
    await expect(trainingDataPage.rows).toHaveCount(0);
  });

  test('[17-14] 詳細期間（30日）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['recent']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.choosePeriod(M.past30days);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual(names);
    // 40 日前に更新したデータは出ない
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.choosePeriod(M.past30days);
    await trainingDataPage.search(seedFileName(10));
    await expect(trainingDataPage.rows).toHaveCount(0);
  });

  test('[17-15] 詳細期間（指定期間）', async ({ trainingDataPage, adminApi, page }) => {
    // seed のファイル10は 40 日前の更新。その日を含む期間を指定すると、そのデータだけが出る
    const res = await adminApi.get(`/api/admin/indexes/${SEED_CLOUD_FOLDER_ID}/files`, {
      params: { displayName: seedFileName(10) },
    });
    const updatedAt = new Date(((await res.json()) as { content: { updatedAt: string }[] }).content[0].updatedAt);
    const now = new Date();
    const monthsAgo = (now.getFullYear() - updatedAt.getFullYear()) * 12 + now.getMonth() - updatedAt.getMonth();
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await chooseCustomPeriod(page, TRAINING_PERIOD_PREFIX, {
      fromMonthsAgo: monthsAgo,
      fromDay: updatedAt.getDate(),
      toMonthsAgo: monthsAgo,
      toDay: updatedAt.getDate(),
    });
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([seedFileName(10)]);
  });

  test('[17-16] 詳細設定フィルター（ON）', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.chooseStatus(M.statusOn);
    // 学習設定 ON のデータだけが出る（OFF のファイル02 は出ない）
    await expect
      .poll(async () => {
        const statuses = await trainingDataPage.columnTexts(FILE_COLUMN.status);
        return statuses.length > 0 && statuses.every((status) => status === M.statusOn);
      })
      .toBe(true);
    expect(await trainingDataPage.fileNames()).not.toContain(seedFileName(2));
  });

  test('[17-17] 詳細設定フィルター（OFF）', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.chooseStatus(M.statusOff);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([seedFileName(2)]);
    expect(await trainingDataPage.columnTexts(FILE_COLUMN.status)).toEqual([M.statusOff]);
  });

  test('[17-18] 詳細並替（更新日時）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['a', 'b', 'c']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.sortBy(M.sortUpdated);
    await trainingDataPage.sortBy(M.desc);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([...names].reverse());
    await trainingDataPage.sortBy(M.asc);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual(names);
  });

  test('[17-19] 詳細並替（表示名）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder } = await makeFolder(adminApi, prefix, ['b', 'c', 'a']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.sortBy(M.sortName);
    await trainingDataPage.sortBy(M.asc);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await trainingDataPage.sortBy(M.desc);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[17-20] 詳細並替（更新者）', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    // ファイル01〜09（管理者 8 件とユーザー1 の 1 件）に絞って、1 ページに 2 人が並ぶようにする
    await trainingDataPage.search('ファイル0');
    await expect(trainingDataPage.rows).toHaveCount(SEED_FILE_COUNT - 2);
    await trainingDataPage.sortBy(M.sortUpdatedBy);
    // 更新者でまとまる（2 人が 1 つずつのまとまりになる）
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.updatedBy)).length).toBe(2);
    const initial = groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.updatedBy));
    // 昇順と降順で、2 人の並びが入れ替わる
    await trainingDataPage.sortBy(M.asc);
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.updatedBy))).toEqual([...initial].reverse());
    await trainingDataPage.sortBy(M.desc);
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.updatedBy))).toEqual(initial);
  });

  test('[17-21] 詳細並替（学習設定）', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    // ファイル01〜09（学習設定 OFF のファイル02 を含む）に絞って、1 ページに ON と OFF が並ぶようにする
    await trainingDataPage.search('ファイル0');
    await expect(trainingDataPage.rows).toHaveCount(SEED_FILE_COUNT - 2);
    await trainingDataPage.sortBy(M.sortLearning);
    // 学習設定でまとまる（ON と OFF が 1 つずつのまとまりになる）
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.status)).length).toBe(2);
    const initial = groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.status));
    // 昇順と降順で、ON と OFF の並びが入れ替わる
    await trainingDataPage.sortBy(M.asc);
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.status))).toEqual([...initial].reverse());
    await trainingDataPage.sortBy(M.desc);
    await expect.poll(async () => groupOrder(await trainingDataPage.columnTexts(FILE_COLUMN.status))).toEqual(initial);
  });

  test('[17-22] 詳細ページ送り', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await expect(trainingDataPage.rows).toHaveCount(PAGE_SIZE);
    const firstPage = await trainingDataPage.fileNames();
    await topPager(page, 'Next page').click();
    await expect.poll(() => trainingDataPage.fileNames()).toHaveLength(SEED_FILE_COUNT - PAGE_SIZE);
    expect(firstPage).not.toContain((await trainingDataPage.fileNames())[0]);
    await expect(filterRow(page)).toContainText(`${PAGE_SIZE + 1}-${SEED_FILE_COUNT}件 / ${SEED_FILE_COUNT}件`);
    await bottomPager(page, 'Previous page').click();
    await expect.poll(() => trainingDataPage.fileNames()).toEqual(firstPage);
    await expect(filterRow(page)).toContainText(COUNT_PATTERN);
  });

  test('[17-23] データ一括選択', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['a', 'b', 'c']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.checkRow(names[0]);
    await trainingDataPage.checkRow(names[1]);
    await expect(page.getByTestId('training-data-deselect-button')).toBeVisible();
    await expect(page.getByTestId('training-data-delete-selected-button')).toBeVisible();
    await expect(page.getByTestId('training-data-edit-name-button')).toBeVisible();
  });

  test('[17-24] データ一括削除', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['a', 'b', 'c']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.checkRow(names[0]);
    await trainingDataPage.checkRow(names[1]);
    await page.getByTestId('training-data-delete-selected-button').click();
    await expect(trainingDataPage.dialog.getByText(M.deleteDataConfirmTitle)).toBeVisible();
    await page.getByTestId('training-data-delete-confirm').click();
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([names[2]]);
  });

  test('[17-25] データ一括名前変更', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['a', 'b', 'c']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.checkRow(names[0]);
    await trainingDataPage.checkRow(names[1]);
    await page.getByTestId('training-data-edit-name-button').click();
    // 選んだ行の表示名が入力欄になる
    const inputs = page.getByLabel('学習データの表示名');
    await expect(inputs).toHaveCount(2);
    await inputs.nth(0).fill(`${prefix}-new-a`);
    await inputs.nth(1).fill(`${prefix}-new-b`);
    await page.getByTestId('training-data-save-rename-button').click();
    await expect
      .poll(async () => (await trainingDataPage.fileNames()).sort())
      .toEqual([`${prefix}-c`, `${prefix}-new-a`, `${prefix}-new-b`]);
  });

  test('[17-26] 詳細データ0件', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_EMPTY_FOLDER_ID, SEED_EMPTY_FOLDER_NAME);
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(trainingDataPage.rows).toHaveCount(0);
  });

  test('[17-27] クラウド詳細表示', async ({ trainingDataPage, page }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await expect(trainingDataPage.addButton).toBeVisible();
    await expect(trainingDataPage.rows.first()).toBeVisible();
    // 一括同期ボタンとローカル用の説明は出ない
    await expect(page.getByRole('button', { name: M.bulkSync })).toHaveCount(0);
    await expect(page.getByText(M.localInfoTitle, { exact: true })).toHaveCount(0);
  });

  test('[17-28] データ追加（クラウド）', async ({ trainingDataPage, adminApi, prefix }) => {
    const { folder } = await makeFolder(adminApi, prefix);
    const displayName = `${prefix}-added`;
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await trainingDataPage.addFile(`${prefix}.txt`, displayName);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([displayName]);
  });

  test('[17-29] データダウンロード', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['dl']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await expect(trainingDataPage.row(names[0])).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await trainingDataPage.row(names[0]).getByTestId('training-data-file-download-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(prefix);
  });

  test('[17-30] クラウド詳細フィルター', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder, names } = await makeFolder(adminApi, prefix, ['on', 'off']);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    // 2 つ目のデータを学習設定 OFF にする
    await trainingDataPage.clickRowMenu(names[1], 'training-data-file-toggle-learning');
    await expect(trainingDataPage.row(names[1])).toContainText(M.statusOff);
    // 学習設定を切り替えてもメニューは開いたままなので、メニューの外（背景）を押して閉じる
    await page.getByTestId('context-menu-backdrop').click({ position: { x: 5, y: 5 } });
    await trainingDataPage.chooseUser(ADMIN_NAME);
    await trainingDataPage.choosePeriod(M.today);
    await trainingDataPage.chooseStatus(M.statusOn);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([names[0]]);
  });

  test('[17-31] フォルダ作成→データ追加', async ({ trainingDataPage, page, prefix }) => {
    const folderName = `${prefix}-created`;
    await trainingDataPage.gotoList();
    await page.getByRole('button', { name: M.createFolder }).click();
    await trainingDataPage.dialog.getByPlaceholder('学習先フォルダの名前を入力').fill(folderName);
    await trainingDataPage.dialog.locator('label.input-radio', { hasText: 'クラウド' }).click();
    await page.getByTestId('admin-training-data-create-submit').click();
    // 作ったフォルダを開き、データを追加する
    await openFolder(page, folderName);
    await expect(trainingDataPage.heading).toHaveText(folderName);
    await trainingDataPage.addFile(`${prefix}.txt`, `${prefix}-data`);
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([`${prefix}-data`]);
  });

  test('[17-32] WS API→学習データ', async ({ trainingDataPage, adminApi, page, prefix }) => {
    // ワークスペース設定で接続先 API を追加すると、学習先フォルダの作成で選べるようになる
    const endpoint = await createTenantEndpoint(adminApi, TENANT_ID, `${prefix}-ep`);
    try {
      await trainingDataPage.gotoList();
      await page.getByRole('button', { name: M.createFolder }).click();
      await trainingDataPage.dialog.locator('label.input-radio', { hasText: 'ローカル' }).click();
      await trainingDataPage.dialog.getByText('接続先エンドポイントを選択').or(trainingDataPage.dialog.locator('.app-select .trigger-wrapper')).first().click();
      await expect(page.getByRole('option', { name: endpoint.name })).toBeVisible();
    } finally {
      await deleteTenantEndpoint(adminApi, TENANT_ID, endpoint);
    }
  });

  test('[17-33] 詳細：検索＋フィルター', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.search('ファイル0');
    await trainingDataPage.chooseUser(ADMIN_NAME);
    // ファイル01〜09 のうち、ユーザー1 のファイル03 を除いたもの
    const expected = [1, 2, 4, 5, 6, 7, 8, 9].map(seedFileName);
    await expect.poll(async () => (await trainingDataPage.fileNames()).sort()).toEqual(expected);
  });

  test('[17-34] 詳細：フィルター＋並べ替え', async ({ trainingDataPage }) => {
    await trainingDataPage.gotoDetail(SEED_CLOUD_FOLDER_ID, SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.chooseUser(ADMIN_NAME);
    await trainingDataPage.sortBy(M.sortName);
    await trainingDataPage.sortBy(M.asc);
    await expect.poll(async () => (await trainingDataPage.fileNames())[0]).toBe(seedFileName(1));
    await trainingDataPage.sortBy(M.desc);
    await expect.poll(async () => (await trainingDataPage.fileNames())[0]).toBe(seedFileName(11));
    // ユーザー1 のファイル03 は絞り込みで出ない
    expect(await trainingDataPage.fileNames()).not.toContain(seedFileName(3));
  });

  test('[17-35] フォルダ名最大長', async ({ trainingDataPage, page, prefix }) => {
    // 最大長は 255 文字（移植元の画面の入力チェック）
    const folderName = `${prefix}-${'f'.repeat(FOLDER_NAME_MAX_LENGTH)}`.slice(0, FOLDER_NAME_MAX_LENGTH);
    expect(folderName).toHaveLength(FOLDER_NAME_MAX_LENGTH);
    await trainingDataPage.gotoList();
    await page.getByRole('button', { name: M.createFolder }).click();
    await trainingDataPage.dialog.getByPlaceholder('学習先フォルダの名前を入力').fill(folderName);
    await trainingDataPage.dialog.locator('label.input-radio', { hasText: 'クラウド' }).click();
    await page.getByTestId('admin-training-data-create-submit').click();
    await expect(trainingDataPage.dialog).toHaveCount(0);
    await expect(page.getByText(folderName, { exact: true })).toBeVisible();
  });

  test('[17-36] データ0件', async ({ trainingDataPage, adminApi, page, prefix }) => {
    const { folder } = await makeFolder(adminApi, prefix);
    await trainingDataPage.gotoDetail(folder.id, folder.name);
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(trainingDataPage.rows).toHaveCount(0);
  });

  test('[17-37] 学習データ Chrome', async ({ trainingDataPage, page, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await trainingDataPage.gotoList();
    await openFolder(page, SEED_CLOUD_FOLDER_NAME);
    await expect(trainingDataPage.heading).toHaveText(SEED_CLOUD_FOLDER_NAME);
    await trainingDataPage.search(seedFileName(5));
    await expect.poll(() => trainingDataPage.fileNames()).toEqual([seedFileName(5)]);
  });
});

/** プランのクレジット上限（テストでは小さな値にして、利用クレジットとの大小を決める）。 */
const PLAN_LIMIT = 1000;
/** テナントごとの従量課金の上限（「プラン制限+テナント制限」の項目で、プランの上限に足される）。 */
const TENANT_LIMIT = 500;

/**
 * プランとテナントのクレジット上限・今月の利用クレジットを決めた専用のテナントで、クラウドのフォルダにファイルを追加する（画面から）。
 * 追加できたかどうかを返す。
 */
async function addFileUnderQuota(
  { loginPage, trainingDataPage, page }: { loginPage: LoginPage; trainingDataPage: TrainingDataPage; page: Page },
  scenario: QuotaScenario
): Promise<{ added: boolean; errorToast: boolean }> {
  const tenant = createQuotaTenant(scenario);
  try {
    const api = await loginApi({ tenantId: tenant.tenantId, loginId: tenant.loginId, password: tenant.password });
    try {
      const folder = await createFolder(api, `quota-folder`, 'SAAS_GLOBAL', tenant.endpointIds);
      await loginPage.login({ tenantId: tenant.tenantId, loginId: tenant.loginId, password: tenant.password });
      await trainingDataPage.gotoDetail(folder.id, folder.name);
      await trainingDataPage.addFile('quota.txt', 'quota-data');
      const added = trainingDataPage.rows.filter({ hasText: 'quota-data' });
      const errorToast = page.getByTestId('toast-error');
      await expect(added.or(errorToast).first()).toBeVisible();
      // エラーのトーストはすぐ消えるので、出ていたかどうかをここで取っておく
      return { added: (await added.count()) === 1, errorToast: (await errorToast.count()) > 0 };
    } finally {
      await api.dispose();
    }
  } finally {
    dropQuotaTenant(tenant);
  }
}

test.describe('17_学習データ（プラン制限）', () => {
  // 専用のテナントを使うので、seed のテナントの管理者ではログインしない（beforeEach なし）
  const cases: { id: string; title: string; scenario: QuotaScenario; allowed: boolean }[] = [
    { id: '38', title: 'ファイル追加-プラン制限-プラン制限内', scenario: { planLimit: PLAN_LIMIT, tenantLimit: 0, usedCredits: 100 }, allowed: true },
    { id: '39', title: 'ファイル追加-プラン制限-プラン制限MAX', scenario: { planLimit: PLAN_LIMIT, tenantLimit: 0, usedCredits: PLAN_LIMIT - 1 }, allowed: true },
    { id: '40', title: 'ファイル追加-プラン制限-プラン制限MAX', scenario: { planLimit: PLAN_LIMIT, tenantLimit: 0, usedCredits: PLAN_LIMIT }, allowed: false },
    { id: '41', title: 'ファイル追加-プラン制限-プラン制限超え', scenario: { planLimit: PLAN_LIMIT, tenantLimit: 0, usedCredits: PLAN_LIMIT + 100 }, allowed: false },
    { id: '42', title: 'ファイル追加-プラン制限+テナント制限-プラン制限内', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: 100 }, allowed: true },
    { id: '43', title: 'ファイル追加-プラン制限+テナント制限-プラン制限MAX', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: PLAN_LIMIT }, allowed: true },
    { id: '44', title: 'ファイル追加-プラン制限+テナント制限-プラン制限超え-テナント制限内', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: PLAN_LIMIT + 100 }, allowed: true },
    { id: '45', title: 'ファイル追加-プラン制限+テナント制限-プラン制限超え-テナント制限MAX', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: PLAN_LIMIT + TENANT_LIMIT - 1 }, allowed: true },
    { id: '46', title: 'ファイル追加-プラン制限+テナント制限-プラン制限超え-テナント制限MAX', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: PLAN_LIMIT + TENANT_LIMIT }, allowed: false },
    { id: '47', title: 'ファイル追加-プラン制限+テナント制限-プラン制限超え-テナント制限超え', scenario: { planLimit: PLAN_LIMIT, tenantLimit: TENANT_LIMIT, usedCredits: PLAN_LIMIT + TENANT_LIMIT + 100 }, allowed: false },
  ];

  for (const { id, title, scenario, allowed } of cases) {
    test(`[17-${id}] ${title}`, async ({ loginPage, trainingDataPage, page }) => {
      // 利用クレジットが上限（プラン + テナント）に達していなければ追加できて一覧に出る。達していれば拒否される
      const result = await addFileUnderQuota({ loginPage, trainingDataPage, page }, scenario);
      expect(result.added, allowed ? 'ファイルが追加されて一覧に出る' : 'ファイル追加が拒否される').toBe(allowed);
      // 拒否のとき、エラーのトーストが出る（文言は項目書に無いので確かめない）
      if (!allowed) expect(result.errorToast, '拒否されたことがトーストで分かる').toBe(true);
    });
  }
});
