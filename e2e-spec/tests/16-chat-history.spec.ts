import { expect, test } from '../src/fixtures-service-settings.ts';
import { CHAT_HISTORY_MESSAGES as M, CHAT_HISTORY_PATH, CHAT_HISTORY_PERIOD_PREFIX } from '../src/pages/chat-history.page.ts';
import {
  bottomPager,
  chooseCustomPeriod,
  COUNT_PATTERN,
  filterRow,
  gotoAdminPage,
  topPager,
} from '../src/pages/service-list-controls.ts';

/**
 * 16_チャット履歴（25 項目）。項目書: 25DA61_結合テスト項目書_md/16_チャット履歴.md
 *
 * 移植元との対応:
 * - 並列で他のテストも同じテナントを使うため、検索・並べ替えの確認は「このテスト専用の接頭辞」で検索して絞り込んでから行う
 * - 期間の確認（項番 6〜9・23）は、「含まれること」を作ったばかりのチャット（今日）で、「含まれないこと」を
 *   seed-demo.sql の管理者のチャット（seed 投入の 2・8・11 日前に更新）で確かめる。環境が古くなるほどこれらはより古くなるので、除外の確認は変わらない
 * - 件数表示は「開始-終了件 / 総数件」（移植元の ja.json の CHAT_HISTORY.PAGE_COUNT）
 * - 項番 25（Chrome）は Playwright の Chromium（Chrome と同じエンジン）で確かめる
 */

test.describe.configure({ timeout: 120_000 });

const USER_NAME = 'ユーザー1';
const ADMIN_NAME = '管理者';
/** seed-demo.sql の管理者のチャット。更新日時は seed 投入の 2・5・8・11 日前。 */
const SEED_ROOM_2_DAYS_AGO = '経費精算の手順（管理者メモ）';
const SEED_ROOM_8_DAYS_AGO = 'お礼メールの定型文';
const SEED_ROOM_11_DAYS_AGO = '社内 FAQ：パスワードの変更';
/** seed-demo.sql の今日更新のチャット（チャット詳細の確認用）。 */
const SEED_ROOM_TODAY = '有給休暇の申請方法';
const PAGE_SIZE = 20;

test.describe('16_チャット履歴', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantAdmin');
  });

  test('[16-01] 一覧表示', async ({ chatHistoryPage, page }) => {
    await chatHistoryPage.goto();
    await expect(page.getByRole('heading', { name: M.title, level: 2 })).toBeVisible();
    const header = page.locator('.table-list-row--header');
    for (const column of ['更新日時', '更新者名', 'チャット名']) {
      await expect(header.getByText(column, { exact: true })).toBeVisible();
    }
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    // 日時は yyyy/MM/dd HH:mm
    await expect(chatHistoryPage.rows.first()).toContainText(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/);
  });

  test('[16-02] キーワード検索', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-alpha`);
    await makeRoom('user', `${prefix}-beta`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(`${prefix}-alp`);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-alpha`]);
  });

  test('[16-03] キーワード検索（0件）', async ({ chatHistoryPage, page, uniqueId }) => {
    await chatHistoryPage.goto();
    await chatHistoryPage.search(uniqueId('none'));
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(chatHistoryPage.rows).toHaveCount(0);
  });

  test('[16-04] ユーザーフィルター', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-u1`);
    await makeRoom('tenantAdmin', `${prefix}-ad`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect.poll(() => chatHistoryPage.rows.count()).toBe(2);
    await chatHistoryPage.chooseUser(USER_NAME);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-u1`]);
    expect(await chatHistoryPage.userNames()).toEqual([USER_NAME]);
  });

  test('[16-05] ユーザー検索付き選択', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-u1`);
    await makeRoom('tenantAdmin', `${prefix}-ad`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect.poll(() => chatHistoryPage.rows.count()).toBe(2);
    // 検索欄に名前の一部を入れて選択肢を絞り込み、その中から選ぶ
    await chatHistoryPage.chooseUser(ADMIN_NAME, '管理');
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-ad`]);
    expect(await chatHistoryPage.userNames()).toEqual([ADMIN_NAME]);
  });

  test('[16-06] 期間（全期間）', async ({ chatHistoryPage }) => {
    await chatHistoryPage.goto();
    await expect(chatHistoryPage.periodTrigger).toContainText(M.allPeriods);
    // 11 日前のチャットも出る
    await chatHistoryPage.search(SEED_ROOM_11_DAYS_AGO);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([SEED_ROOM_11_DAYS_AGO]);
  });

  test('[16-07] 期間（今日）', async ({ chatHistoryPage, makeRoom, page, prefix }) => {
    await makeRoom('user', `${prefix}-today`);
    await chatHistoryPage.goto();
    await chatHistoryPage.choosePeriod(M.today);
    await chatHistoryPage.search(prefix);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-today`]);
    // 2 日前に更新したチャットは出ない
    await chatHistoryPage.search(SEED_ROOM_2_DAYS_AGO);
    // 絞り込みの結果が反映されて 0 件の表示になるのを待つ（読み込み中の 0 行で通らないように）
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(chatHistoryPage.rows).toHaveCount(0);
  });

  test('[16-08] 期間（7日）', async ({ chatHistoryPage, makeRoom, page, prefix }) => {
    await makeRoom('user', `${prefix}-recent`);
    await chatHistoryPage.goto();
    await chatHistoryPage.choosePeriod(M.past7days);
    await chatHistoryPage.search(prefix);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-recent`]);
    // 8 日前に更新したチャットは出ない
    await chatHistoryPage.search(SEED_ROOM_8_DAYS_AGO);
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(chatHistoryPage.rows).toHaveCount(0);
  });

  test('[16-09] 期間（30日）', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-recent`);
    await chatHistoryPage.goto();
    await chatHistoryPage.choosePeriod(M.past30days);
    await chatHistoryPage.search(prefix);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-recent`]);
  });

  test('[16-10] 並替（更新日時）', async ({ chatHistoryPage, makeRoom, prefix }) => {
    const first = await makeRoom('user', `${prefix}-first`);
    const second = await makeRoom('user', `${prefix}-second`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect(chatHistoryPage.rows).toHaveCount(2);
    await chatHistoryPage.sortBy(M.sortUpdated);
    await chatHistoryPage.sortBy(M.desc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([second.name, first.name]);
  });

  test('[16-11] 並替（更新者名）', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-u1`);
    await makeRoom('tenantAdmin', `${prefix}-ad`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect(chatHistoryPage.rows).toHaveCount(2);
    await chatHistoryPage.sortBy(M.sortUser);
    await chatHistoryPage.sortBy(M.asc);
    await expect.poll(async () => (await chatHistoryPage.userNames()).length).toBe(2);
    const ascending = await chatHistoryPage.userNames();
    await chatHistoryPage.sortBy(M.desc);
    await expect.poll(() => chatHistoryPage.userNames()).toEqual([...ascending].reverse());
    // 更新者名の順（2 人は別の名前なので、昇順と降順で先頭が入れ替わる）
    expect(new Set(ascending).size).toBe(2);
  });

  test('[16-12] 並替（チャット名）', async ({ chatHistoryPage, makeRoom, prefix }) => {
    for (const suffix of ['b', 'c', 'a']) await makeRoom('user', `${prefix}-${suffix}`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect(chatHistoryPage.rows).toHaveCount(3);
    await chatHistoryPage.sortBy(M.sortChat);
    await chatHistoryPage.sortBy(M.asc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[16-13] 並替（昇順/降順）', async ({ chatHistoryPage, makeRoom, prefix }) => {
    for (const suffix of ['b', 'c', 'a']) await makeRoom('user', `${prefix}-${suffix}`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await expect(chatHistoryPage.rows).toHaveCount(3);
    await chatHistoryPage.sortBy(M.sortChat);
    await chatHistoryPage.sortBy(M.asc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await chatHistoryPage.sortBy(M.desc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[16-14] ページ送り（上部）', async ({ chatHistoryPage }) => {
    await chatHistoryPage.goto();
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    const firstPage = await chatHistoryPage.roomNames();
    expect(firstPage).toHaveLength(PAGE_SIZE);
    await topPager(chatHistoryPage.page, 'Next page').click();
    await expect.poll(async () => (await chatHistoryPage.roomNames())[0]).not.toBe(firstPage[0]);
    await expect(filterRow(chatHistoryPage.page)).toContainText(/21-\d+件 \/ \d+件/);
  });

  test('[16-15] ページ送り（下部）', async ({ chatHistoryPage }) => {
    await chatHistoryPage.goto();
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    const firstPage = await chatHistoryPage.roomNames();
    await bottomPager(chatHistoryPage.page, 'Next page').click();
    await expect.poll(async () => (await chatHistoryPage.roomNames())[0]).not.toBe(firstPage[0]);
    await expect(filterRow(chatHistoryPage.page)).toContainText(/21-\d+件 \/ \d+件/);
  });

  test('[16-16] 件数表示', async ({ chatHistoryPage }) => {
    await chatHistoryPage.goto();
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    await expect(filterRow(chatHistoryPage.page)).toContainText(COUNT_PATTERN);
    const match = COUNT_PATTERN.exec(await filterRow(chatHistoryPage.page).innerText());
    expect(match?.[1]).toBe('1');
    expect(match?.[2]).toBe(String(PAGE_SIZE));
    expect(Number(match?.[3])).toBeGreaterThanOrEqual(PAGE_SIZE);
  });

  test('[16-17] チャット詳細遷移', async ({ chatHistoryPage, page }) => {
    await chatHistoryPage.goto();
    await chatHistoryPage.search(SEED_ROOM_TODAY);
    await expect(chatHistoryPage.rows).toHaveCount(1);
    await chatHistoryPage.detailButton(SEED_ROOM_TODAY).click();
    await expect(page).toHaveURL(/\/admin\/chat-history\/[0-9a-f]+/);
    // 該当チャットルームの画面（チャット名が見出しに出る）
    await expect(page.getByText(SEED_ROOM_TODAY).first()).toBeVisible();
  });

  test('[16-18] 履歴0件', async ({ chatHistoryPage, page, uniqueId }) => {
    await chatHistoryPage.goto();
    await chatHistoryPage.choosePeriod(M.today);
    await chatHistoryPage.search(uniqueId('none'));
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(chatHistoryPage.rows).toHaveCount(0);
  });

  test('[16-19] 読み込み中表示', async ({ chatHistoryPage, page }) => {
    // 一覧の取得を 3 秒遅らせて、取得中の画面を確かめる
    await page.route('**/api/admin/histories**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await gotoAdminPage(page, CHAT_HISTORY_PATH);
    await expect(chatHistoryPage.loading).toBeVisible();
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    await expect(chatHistoryPage.loading).toHaveCount(0);
  });

  test('[16-20] 検索＋ユーザー＋期間', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-x`);
    await makeRoom('tenantAdmin', `${prefix}-y`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await chatHistoryPage.chooseUser(USER_NAME);
    await chatHistoryPage.choosePeriod(M.today);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-x`]);
  });

  test('[16-21] フィルター＋並べ替え', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-b`);
    await makeRoom('user', `${prefix}-a`);
    await makeRoom('tenantAdmin', `${prefix}-c`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await chatHistoryPage.chooseUser(USER_NAME);
    await expect(chatHistoryPage.rows).toHaveCount(2);
    await chatHistoryPage.sortBy(M.sortChat);
    await chatHistoryPage.sortBy(M.asc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-a`, `${prefix}-b`]);
    await chatHistoryPage.sortBy(M.desc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-b`, `${prefix}-a`]);
  });

  test('[16-22] 検索＋並べ替え', async ({ chatHistoryPage, makeRoom, prefix }) => {
    for (const suffix of ['b', 'a', 'c']) await makeRoom('user', `${prefix}-${suffix}`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(`${prefix}`);
    await expect(chatHistoryPage.rows).toHaveCount(3);
    await chatHistoryPage.sortBy(M.sortChat);
    await chatHistoryPage.sortBy(M.desc);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[16-23] 期間指定0件', async ({ chatHistoryPage, page }) => {
    await chatHistoryPage.goto();
    await expect(chatHistoryPage.rows.first()).toBeVisible();
    // 3 か月前の 1〜3 日（このテナントのチャットは無い期間）
    await chooseCustomPeriod(page, CHAT_HISTORY_PERIOD_PREFIX, {
      fromMonthsAgo: 3,
      fromDay: 1,
      toMonthsAgo: 3,
      toDay: 3,
    });
    await expect(page.getByText(M.noData)).toBeVisible();
    await expect(chatHistoryPage.rows).toHaveCount(0);
  });

  test('[16-24] 検索1件', async ({ chatHistoryPage, makeRoom, prefix }) => {
    await makeRoom('user', `${prefix}-only`);
    await makeRoom('user', `${prefix}-other`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(`${prefix}-only`);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-only`]);
  });

  test('[16-25] チャット履歴 Chrome', async ({ chatHistoryPage, makeRoom, page, prefix, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await makeRoom('user', `${prefix}-chrome`);
    await chatHistoryPage.goto();
    await chatHistoryPage.search(prefix);
    await chatHistoryPage.chooseUser(USER_NAME);
    await expect.poll(() => chatHistoryPage.roomNames()).toEqual([`${prefix}-chrome`]);
    await chatHistoryPage.detailButton(`${prefix}-chrome`).click();
    await expect(page).toHaveURL(/\/admin\/chat-history\/[0-9a-f]+/);
  });
});
