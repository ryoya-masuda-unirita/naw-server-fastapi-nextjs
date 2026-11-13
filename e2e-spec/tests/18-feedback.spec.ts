import type { Locator, Page, Response } from '@playwright/test';
import { expect, test } from '../src/fixtures.ts';
import {
  createFeedbackFixture,
  createRoomLearningFile,
  deleteFeedbackFixture,
  FAQ_FOLDER_ID,
  FAQ_FOLDER_NAME,
  HELP_DESK_ASSISTANT_ID,
  HELP_DESK_ASSISTANT_NAME,
} from '../src/feedback-data.ts';
import {
  chooseOption,
  FEEDBACK_MESSAGES as M,
  FEEDBACK_PAGE_SIZE,
  FeedbackPage,
  readPaged,
  type FeedbackTab,
} from '../src/pages/feedback.page.ts';
import { quote, sql, sqlNumber } from '../src/sql-e.ts';
import { TENANT_ID } from '../src/users.ts';

/**
 * 18_フィードバック管理（52 項目）。項目書: 25DA61_結合テスト項目書_md/18_フィードバック管理.md
 *
 * 移植元との対応:
 * - 期待値の「正」は DB（SQL）。一覧の件数・並び順は画面や API を介さず DB から取り、画面に出る値と突き合わせる
 * - 並べ替えは、移植元 server の実装に合わせる（項目書の「〜名順」でも、移植元は次の列で並べる）:
 *     アシスタント名順 = message.assistantId（ID）、追加学習順・学習先フォルダ順 = index_id、
 *     精度順 = rating の文字列（移植元の列は varchar なので BAD < GOOD）、満足度順 = rating の文字列（varchar）
 * - 一括選択（複数行のチェックボックス・一括の学習先指定）は、移植元の現行 client（accuracy-tab・satisfaction-tab）に UI がない。
 *   項目書の 16〜19・35・50 は、移植元の画面に存在しないため test.skip にしている
 * - 満足度タブの「追加学習順」「学習先フォルダ順」は、移植元 server が sortField に受け付けない（`^(updatedAt|chat|name|level)$`）ため、
 *   移植元でも成立しない。test.skip にしている
 * - 一覧が空にならないよう seed を使い、追加学習など状態を変えるテストは SQL で自分用の行を入れて消す
 * - 同じ DB の件数を数えるため、このファイルのテストは直列で流す
 */

// 直列（default）: fullyParallel の設定を上書きし、このファイルの中は 1 つのワーカーで順に流す（失敗しても残りは流れる）
test.describe.configure({ mode: 'default' });

const ASSISTANT_COLUMN = 'アシスタント表示名';
const ACCURACY_HEADERS = [ASSISTANT_COLUMN, '精度', '質問と回答の概要', '更新日時', '追加学習', '学習先フォルダ名'];
const SATISFACTION_HEADERS = ['チャット名', '満足度', ASSISTANT_COLUMN, '更新者名', '更新日時', '追加学習', '学習先フォルダ名'];

interface MessageFeedbackItem {
  id: string;
  rating: 'GOOD' | 'BAD';
  indexId: string | null;
  updatedAt: string;
  message: { assistantId: string; assistantName: string | null; content: { question: string | null; answer: string | null } };
}

interface RoomFeedbackItem {
  id: string;
  roomId: string;
  rating: string;
  indexId: string | null;
  userName: string | null;
  updatedAt: string;
  room: { name: string; defaultAssistantId: string; defaultAssistantName: string | null };
}

interface UserFeedbackItem {
  user: { id: string; userId: string; displayName: string };
  feedbackMessageCount: number;
  feedbackRoomCount: { excellent: number; veryGood: number; good: number; average: number; poor: number };
  updatedAt: string;
}

const ACCURACY_LABEL = { GOOD: M.accurate, BAD: M.inaccurate } as const;

/** 昇順（asc）または降順（desc）に並んでいること。 */
function expectOrdered(values: string[], order: 'asc' | 'desc'): void {
  const sorted = [...values].sort();
  if (order === 'desc') sorted.reverse();
  expect(values).toEqual(sorted);
}

/** 表示された行数は、全件数と 1 ページの件数から決まる値であること。 */
function expectedRowCount(total: number, page = 0): number {
  return Math.max(0, Math.min(FEEDBACK_PAGE_SIZE, total - page * FEEDBACK_PAGE_SIZE));
}

function countText(total: number, page = 0): string {
  const from = page * FEEDBACK_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * FEEDBACK_PAGE_SIZE, total);
  return `${from}-${to}件 / ${total}件`;
}

/** 回答精度評価の件数（条件は SQL の WHERE の続き）。 */
function accuracyCount(where = ''): number {
  return sqlNumber(`
    SELECT count(*) FROM message_feedbacks f JOIN messages m ON m.id = f.message_id
    WHERE f.tenant_id = ${quote(TENANT_ID)} ${where}`);
}

/** チャット満足度の件数（評価済みのルーム）。 */
function satisfactionCount(where = ''): number {
  return sqlNumber(`SELECT count(*) FROM rooms r WHERE r.tenant_id = ${quote(TENANT_ID)} AND r.rating IS NOT NULL ${where}`);
}

function assistantIdByName(name: string): string {
  const rows = sql(`SELECT id FROM assistants WHERE tenant_id = ${quote(TENANT_ID)} AND name = ${quote(name)}`);
  return rows[0][0];
}

async function bodyOf<T>(response: Response): Promise<T[]> {
  return (await readPaged<T>(response)).content;
}

/** 回答精度タブの画面の行が、API の応答（content）と同じ内容であること。 */
async function expectAccuracyRowsMatch(fb: FeedbackPage, items: MessageFeedbackItem[]): Promise<void> {
  await expect(fb.rows).toHaveCount(items.length);
  const rows = await fb.readRows();
  items.forEach((item, index) => {
    expect(rows[index][0]).toBe(item.message.assistantName ?? '');
    expect(rows[index][1]).toBe(ACCURACY_LABEL[item.rating]);
    expect(rows[index][4]).toBe(item.indexId ? 'ON' : 'OFF');
  });
}

test.describe('18_フィードバック管理', () => {
  test.beforeAll(() => {
    // seed のフィードバックは更新日時がすべて同じ。移植元と同じく更新日時だけで並べるため、ページ送りで行が重複・欠落して見える。
    // 件数・内容は変えず、更新日時だけを 1 分ずつずらして並びを一意にする
    sql(`
      UPDATE message_feedbacks f SET updated_at = now() - (t.n * interval '1 minute')
      FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM message_feedbacks WHERE tenant_id = ${quote(TENANT_ID)}) t
      WHERE f.id = t.id`);
  });

  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantAdmin');
  });

  test('[18-01] 画面表示', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    await expect(page).toHaveURL(/\/admin\/feedback/);
    await fb.expectLoaded();
    await expect(fb.tabButton('accuracy')).toBeVisible();
    await expect(fb.tabButton('satisfaction')).toBeVisible();
    await expect(fb.tabButton('count')).toBeVisible();
  });

  test('[18-02] 精度タブ表示', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const response = await fb.open();
    const items = await bodyOf<MessageFeedbackItem>(response);
    for (const header of ACCURACY_HEADERS) await expect(fb.main.getByText(header, { exact: true }).first()).toBeVisible();
    await expect(fb.rows).toHaveCount(expectedRowCount(accuracyCount()));
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-03] 精度：アシスタントフィルター', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.applyFilter('accuracy', 0, 'コードレビュー補助');
    const items = await bodyOf<MessageFeedbackItem>(response);
    const assistantId = assistantIdByName('コードレビュー補助');
    const total = accuracyCount(`AND m.assistant_id = ${quote(assistantId)}`);
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.message.assistantId === assistantId)).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    const rows = await fb.readRows();
    expect(rows.every((row) => row[0] === 'コードレビュー補助')).toBe(true);
  });

  test('[18-04] 精度：精度フィルター（不正確）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.applyFilter('accuracy', 1, M.inaccurate);
    const items = await bodyOf<MessageFeedbackItem>(response);
    const total = accuracyCount("AND f.rating = 'BAD'");
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.rating === 'BAD')).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row[1] === M.inaccurate)).toBe(true);
  });

  test('[18-05] 精度：精度フィルター（正確）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.applyFilter('accuracy', 1, M.accurate);
    const items = await bodyOf<MessageFeedbackItem>(response);
    const total = accuracyCount("AND f.rating = 'GOOD'");
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.rating === 'GOOD')).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row[1] === M.accurate)).toBe(true);
  });

  test('[18-06] 精度：学習先フォルダフィルター', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.applyFilter('accuracy', 2, FAQ_FOLDER_NAME);
    const items = await bodyOf<MessageFeedbackItem>(response);
    const total = accuracyCount(`AND f.index_id = ${quote(FAQ_FOLDER_ID)}`);
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.indexId === FAQ_FOLDER_ID)).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row[5] === FAQ_FOLDER_NAME)).toBe(true);
  });

  test('[18-07] 精度：並替（更新日時）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    // 既定が「更新日時順」のため、いったん別の項目にしてから選び直す
    await fb.sortBy('accuracy', '精度順');
    const response = await fb.sortBy('accuracy', '更新日時順');
    const items = await bodyOf<MessageFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('updatedAt');
    expectOrdered(items.map((item) => item.updatedAt), 'desc');
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-08] 精度：並替（アシスタント名）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.sortBy('accuracy', 'アシスタント表示名順');
    const items = await bodyOf<MessageFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('name');
    // 移植元は message.assistantId で並べる（画面の表示名ではない）。既定の降順
    expectOrdered(items.map((item) => item.message.assistantId), 'desc');
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-09] 精度：並替（精度）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.sortBy('accuracy', '精度順');
    const items = await bodyOf<MessageFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('accuracy');
    // 移植元の rating は varchar(16)。文字列の降順は GOOD（正確）→ BAD（不正確）
    expectOrdered(items.map((item) => item.rating), 'desc');
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-10] 精度：並替（追加学習）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.sortBy('accuracy', '追加学習順');
    const items = await bodyOf<MessageFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('add');
    // 移植元は index_id で並べる。降順は PostgreSQL の既定で NULL（OFF）が先
    const expected = sql(
      `SELECT coalesce(index_id, '') FROM message_feedbacks WHERE tenant_id = ${quote(TENANT_ID)} ORDER BY index_id DESC LIMIT ${FEEDBACK_PAGE_SIZE}`
    ).map((row) => row[0]);
    expect(items.map((item) => item.indexId ?? '')).toEqual(expected);
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-11] 精度：並替（学習先フォルダ）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    const response = await fb.sortBy('accuracy', '学習先フォルダ名順');
    const items = await bodyOf<MessageFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('folder');
    const expected = sql(
      `SELECT coalesce(index_id, '') FROM message_feedbacks WHERE tenant_id = ${quote(TENANT_ID)} ORDER BY index_id DESC LIMIT ${FEEDBACK_PAGE_SIZE}`
    ).map((row) => row[0]);
    expect(items.map((item) => item.indexId ?? '')).toEqual(expected);
    await expectAccuracyRowsMatch(fb, items);
  });

  test('[18-12] 精度：並替（昇順/降順）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const first = await bodyOf<MessageFeedbackItem>(await fb.open());
    expectOrdered(first.map((item) => item.updatedAt), 'desc');
    const ascending = await bodyOf<MessageFeedbackItem>(await fb.sortOrder('accuracy', M.sortAsc));
    expectOrdered(ascending.map((item) => item.updatedAt), 'asc');
    const oldest = sql(
      `SELECT f.id FROM message_feedbacks f WHERE f.tenant_id = ${quote(TENANT_ID)} ORDER BY f.updated_at ASC LIMIT 1`
    )[0][0];
    const oldestAt = sql(`SELECT updated_at FROM message_feedbacks WHERE id = ${quote(oldest)}`)[0][0];
    expect(new Date(ascending[0].updatedAt).getTime()).toBe(new Date(oldestAt).getTime());
    const descending = await bodyOf<MessageFeedbackItem>(await fb.sortOrder('accuracy', M.sortDesc));
    expectOrdered(descending.map((item) => item.updatedAt), 'desc');
    expect(descending[0].updatedAt).not.toBe(ascending[0].updatedAt);
  });

  test('[18-13] 精度：ページ送り', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const total = accuracyCount();
    const first = await bodyOf<MessageFeedbackItem>(await fb.open());
    const second = await bodyOf<MessageFeedbackItem>(await fb.goToNextPage('accuracy'));
    expect(second.length).toBe(expectedRowCount(total, 1));
    expect(second.map((item) => item.id).some((id) => first.map((f) => f.id).includes(id))).toBe(false);
    await expect(fb.countText).toHaveText(countText(total, 1));
    await expectAccuracyRowsMatch(fb, second);
  });

  test('[18-14] 精度：件数表示', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    await expect(fb.countText).toHaveText(countText(accuracyCount()));
  });

  test('[18-15] 精度：個別学習先指定', async ({ page }) => {
    const fixture = createFeedbackFixture({ label: '個別学習', messageRating: 'GOOD' });
    try {
      const fb = new FeedbackPage(page);
      await fb.open();
      const row = fb.rows.filter({ hasText: fixture.question });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('OFF');
      await specifyFolder(page, fb, row, 'accuracy', FAQ_FOLDER_NAME);
      await expect(fb.rows.filter({ hasText: fixture.question })).toContainText(FAQ_FOLDER_NAME);
      await expect(fb.rows.filter({ hasText: fixture.question })).toContainText('ON');
      expect(sql(`SELECT index_id FROM message_feedbacks WHERE id = ${quote(fixture.feedbackId)}`)[0][0]).toBe(FAQ_FOLDER_ID);
    } finally {
      deleteFeedbackFixture(fixture);
    }
  });

  test('[18-16] 精度：一括選択', async () => {
    test.skip(true, '移植元の現行 client（accuracy-tab）に行のチェックボックス・「選択を解除」・一括の学習先指定がなく、移植元の画面にない操作のため');
  });

  test('[18-17] 精度：一括学習先指定', async () => {
    test.skip(true, '移植元の現行 client（accuracy-tab）に一括の学習先指定がなく、移植元の画面にない操作のため');
  });

  test('[18-18] 精度：全選択', async () => {
    test.skip(true, '移植元の現行 client（accuracy-tab）に全選択のチェックボックスがなく、移植元の画面にない操作のため');
  });

  test('[18-19] 精度：選択解除', async () => {
    test.skip(true, '移植元の現行 client（accuracy-tab）に選択状態・「選択を解除」がなく、移植元の画面にない操作のため');
  });

  test('[18-20] 精度：0件', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    // seed の「学習データ確認用0件フォルダ」は、どの回答も学習先にしていない
    const folderName = '学習データ確認用0件フォルダ';
    expect(accuracyCount("AND f.index_id = 'f1000000000040008000000000000003'")).toBe(0);
    const response = await fb.applyFilter('accuracy', 2, folderName);
    expect((await readPaged<MessageFeedbackItem>(response)).totalElements).toBe(0);
    await expect(fb.rows).toHaveCount(0);
    await expect(fb.emptyMessage).toBeVisible();
  });

  test('[18-21] 満足度タブ表示', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const items = await bodyOf<RoomFeedbackItem>(await fb.open('satisfaction'));
    await expect(fb.rows).toHaveCount(expectedRowCount(satisfactionCount()));
    expect(items.length).toBe(expectedRowCount(satisfactionCount()));
    await expect(fb.countText).toHaveText(countText(satisfactionCount()));
    const rows = await fb.readRows();
    items.forEach((item, index) => {
      expect(rows[index].join(' ')).toContain(item.room.name);
    });
    for (const header of SATISFACTION_HEADERS) await expect(fb.main.getByText(header, { exact: true }).first()).toBeVisible();
  });

  test('[18-22] 満足度：アシスタントフィルター', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.applyFilter('satisfaction', 0, HELP_DESK_ASSISTANT_NAME);
    const items = await bodyOf<RoomFeedbackItem>(response);
    const total = satisfactionCount(`AND r.default_assistant_id = ${quote(HELP_DESK_ASSISTANT_ID)}`);
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.room.defaultAssistantId === HELP_DESK_ASSISTANT_ID)).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row.join(' ').includes(HELP_DESK_ASSISTANT_NAME))).toBe(true);
  });

  test('[18-23] 満足度：満足度フィルター（★1）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.applyFilter('satisfaction', 1, '★☆☆☆☆');
    const items = await bodyOf<RoomFeedbackItem>(response);
    const total = satisfactionCount("AND r.rating = 'POOR'");
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.rating === 'POOR')).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row.join(' ').includes('★☆☆☆☆'))).toBe(true);
  });

  test('[18-24] 満足度：満足度フィルター（★5）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.applyFilter('satisfaction', 1, '★★★★★');
    const items = await bodyOf<RoomFeedbackItem>(response);
    const total = satisfactionCount("AND r.rating = 'EXCELLENT'");
    expect(total).toBeGreaterThan(0);
    expect(items.every((item) => item.rating === 'EXCELLENT')).toBe(true);
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row.join(' ').includes('★★★★★'))).toBe(true);
  });

  test('[18-25] 満足度：学習先フォルダフィルター', async ({ page }) => {
    // 満足度タブの学習先フォルダは、ルームに紐づく追加学習のファイル（files.room_id）から決まる
    const fixture = createFeedbackFixture({ label: '満足度フォルダ', roomRating: 'GOOD' });
    try {
      createRoomLearningFile(fixture.roomId, FAQ_FOLDER_ID);
      const fb = new FeedbackPage(page);
      await fb.open('satisfaction');
      const response = await fb.applyFilter('satisfaction', 2, FAQ_FOLDER_NAME);
      const items = await bodyOf<RoomFeedbackItem>(response);
      const total = satisfactionCount(
        `AND r.id IN (SELECT room_id FROM files WHERE tenant_id = ${quote(TENANT_ID)} AND index_id = ${quote(FAQ_FOLDER_ID)})`
      );
      expect(total).toBeGreaterThan(0);
      expect(items.map((item) => item.roomId)).toContain(fixture.roomId);
      expect(items.every((item) => item.indexId === FAQ_FOLDER_ID)).toBe(true);
      await expect(fb.countText).toHaveText(countText(total));
    } finally {
      deleteFeedbackFixture(fixture);
    }
  });

  test('[18-26] 満足度：並替（更新日時）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    await fb.sortBy('satisfaction', 'チャット名順');
    const response = await fb.sortBy('satisfaction', '更新日時順');
    const items = await bodyOf<RoomFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('updatedAt');
    expectOrdered(items.map((item) => item.updatedAt), 'desc');
  });

  test('[18-27] 満足度：並替（チャット名）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.sortBy('satisfaction', 'チャット名順');
    const items = await bodyOf<RoomFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('chat');
    const expected = sql(
      `SELECT name FROM rooms WHERE tenant_id = ${quote(TENANT_ID)} AND rating IS NOT NULL ORDER BY name DESC LIMIT ${FEEDBACK_PAGE_SIZE}`
    ).map((row) => row[0]);
    expect(items.map((item) => item.room.name)).toEqual(expected);
  });

  test('[18-28] 満足度：並替（アシスタント名）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.sortBy('satisfaction', 'アシスタント表示名順');
    const items = await bodyOf<RoomFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('name');
    // 移植元は defaultAssistantId で並べる
    expectOrdered(items.map((item) => item.room.defaultAssistantId), 'desc');
  });

  test('[18-29] 満足度：並替（満足度）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const response = await fb.sortBy('satisfaction', '満足度順');
    const items = await bodyOf<RoomFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('level');
    // 移植元の rooms.rating は varchar(32)。文字列の降順（VERY_GOOD → POOR → GOOD → EXCELLENT → AVERAGE）
    expectOrdered(items.map((item) => item.rating), 'desc');
  });

  test('[18-30] 満足度：並替（追加学習）', async () => {
    test.skip(true, '移植元 server の GET /api/admin/feedbackRoom が sortField=add を受け付けず（`^(updatedAt|chat|name|level)$`）、移植元でも成立しないため');
  });

  test('[18-31] 満足度：並替（学習先フォルダ）', async () => {
    test.skip(true, '移植元 server の GET /api/admin/feedbackRoom が sortField=folder を受け付けず（`^(updatedAt|chat|name|level)$`）、移植元でも成立しないため');
  });

  test('[18-32] 満足度：並替（昇順/降順）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    const ascending = await bodyOf<RoomFeedbackItem>(await fb.sortOrder('satisfaction', M.sortAsc));
    expectOrdered(ascending.map((item) => item.updatedAt), 'asc');
    const descending = await bodyOf<RoomFeedbackItem>(await fb.sortOrder('satisfaction', M.sortDesc));
    expectOrdered(descending.map((item) => item.updatedAt), 'desc');
    expect(descending[0].updatedAt).not.toBe(ascending[0].updatedAt);
  });

  test('[18-33] 満足度：ページ送り', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const total = satisfactionCount();
    const first = await bodyOf<RoomFeedbackItem>(await fb.open('satisfaction'));
    const second = await bodyOf<RoomFeedbackItem>(await fb.goToNextPage('satisfaction'));
    expect(second.length).toBe(expectedRowCount(total, 1));
    expect(second.some((item) => first.map((f) => f.id).includes(item.id))).toBe(false);
    await expect(fb.countText).toHaveText(countText(total, 1));
  });

  test('[18-34] 満足度：個別学習先指定', async ({ page }) => {
    const fixture = createFeedbackFixture({ label: '満足度個別学習', roomRating: 'VERY_GOOD' });
    try {
      const fb = new FeedbackPage(page);
      await fb.open('satisfaction');
      const row = fb.rows.filter({ hasText: fixture.roomName });
      await expect(row).toHaveCount(1);
      await specifyFolder(page, fb, row, 'satisfaction', FAQ_FOLDER_NAME);
      await expect(fb.rows.filter({ hasText: fixture.roomName })).toContainText(FAQ_FOLDER_NAME);
      expect(
        sqlNumber(`SELECT count(*) FROM files WHERE room_id = ${quote(fixture.roomId)} AND index_id = ${quote(FAQ_FOLDER_ID)}`)
      ).toBeGreaterThan(0);
    } finally {
      deleteFeedbackFixture(fixture);
    }
  });

  test('[18-35] 満足度：一括学習先指定', async () => {
    test.skip(true, '移植元の現行 client（satisfaction-tab）に複数選択・一括の学習先指定がなく、移植元の画面にない操作のため');
  });

  test('[18-36] 回答数タブ表示', async ({ page }) => {
    const fb = new FeedbackPage(page);
    const items = await bodyOf<UserFeedbackItem>(await fb.open('count'));
    expect(items.length).toBeGreaterThan(0);
    await expect(fb.rows).toHaveCount(items.length);
    const total = sqlNumber(`SELECT count(*) FROM users WHERE tenant_id = ${quote(TENANT_ID)} AND role <> 'SYSTEM'`);
    expect(total).toBeGreaterThan(0);
    const rows = await fb.readRows();
    items.forEach((item, index) => {
      expect(rows[index].join(' ')).toContain(item.user.displayName);
    });
  });

  test('[18-37] 回答数：回答状況フィルター（回答あり）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const response = await fb.applyFilter('count', 0, M.responded);
    const paged = await readPaged<UserFeedbackItem>(response);
    expect(paged.content.every((item) => item.feedbackMessageCount > 0)).toBe(true);
    expect(paged.totalElements).toBe(usersWithFeedbackCount());
  });

  test('[18-38] 回答数：回答状況フィルター（未回答）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const response = await fb.applyFilter('count', 0, M.noResponse);
    const paged = await readPaged<UserFeedbackItem>(response);
    expect(paged.content.every((item) => item.feedbackMessageCount === 0)).toBe(true);
    expect(paged.totalElements).toBeGreaterThan(0);
  });

  test('[18-39] 回答数：満足度フィルター', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const response = await fb.applyFilter('count', 1, '★★★★★');
    const paged = await readPaged<UserFeedbackItem>(response);
    expect(paged.totalElements).toBeGreaterThan(0);
    expect(paged.content.every((item) => item.feedbackRoomCount.excellent > 0)).toBe(true);
    const expected = sqlNumber(
      `SELECT count(DISTINCT user_id) FROM rooms WHERE tenant_id = ${quote(TENANT_ID)} AND rating = 'EXCELLENT'`
    );
    expect(paged.totalElements).toBe(expected);
  });

  test('[18-40] 回答数：並替（更新日時）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    await fb.sortBy('count', 'ユーザー表示名順');
    const response = await fb.sortBy('count', '更新日時順');
    const items = await bodyOf<UserFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('updatedAt');
    expectOrdered(items.map((item) => item.updatedAt), 'desc');
  });

  test('[18-41] 回答数：並替（ユーザー名）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const response = await fb.sortBy('count', 'ユーザー表示名順');
    const items = await bodyOf<UserFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('name');
    const expected = sql(
      `SELECT name FROM users WHERE tenant_id = ${quote(TENANT_ID)} AND role <> 'SYSTEM' ORDER BY name DESC LIMIT ${items.length}`
    ).map((row) => row[0]);
    expect(items.map((item) => item.user.displayName)).toEqual(expected);
  });

  test('[18-42] 回答数：並替（精度評価数）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const response = await fb.sortBy('count', '精度評価数順');
    const items = await bodyOf<UserFeedbackItem>(response);
    expect(new URL(response.url()).searchParams.get('sortField')).toBe('count');
    const counts = items.map((item) => item.feedbackMessageCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const maxCount = sqlNumber(
      `SELECT max(c) FROM (SELECT count(*) AS c FROM message_feedbacks WHERE tenant_id = ${quote(TENANT_ID)} GROUP BY user_id) t`
    );
    expect(counts[0]).toBe(maxCount);
  });

  test('[18-43] 回答数：並替（満足度★1〜★5）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    const stars: [string, 'poor' | 'average' | 'good' | 'veryGood' | 'excellent', string][] = [
      ['★☆☆☆☆順', 'poor', 'sortField=review1'],
      ['★★☆☆☆順', 'average', 'sortField=review2'],
      ['★★★☆☆順', 'good', 'sortField=review3'],
      ['★★★★☆順', 'veryGood', 'sortField=review4'],
      ['★★★★★順', 'excellent', 'sortField=review5'],
    ];
    for (const [label, key, param] of stars) {
      const response = await fb.sortBy('count', label);
      expect(response.url()).toContain(param);
      const items = await bodyOf<UserFeedbackItem>(response);
      const values = items.map((item) => item.feedbackRoomCount[key]);
      expect(values, label).toEqual([...values].sort((a, b) => b - a));
    }
  });

  test('[18-44] 回答数：並替（昇順/降順）', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    await fb.sortBy('count', '精度評価数順');
    const ascending = await bodyOf<UserFeedbackItem>(await fb.sortOrder('count', M.sortAsc));
    const ascCounts = ascending.map((item) => item.feedbackMessageCount);
    expect(ascCounts).toEqual([...ascCounts].sort((a, b) => a - b));
    const descending = await bodyOf<UserFeedbackItem>(await fb.sortOrder('count', M.sortDesc));
    const descCounts = descending.map((item) => item.feedbackMessageCount);
    expect(descCounts).toEqual([...descCounts].sort((a, b) => b - a));
    expect(descCounts[0]).toBeGreaterThan(ascCounts[0]);
  });

  test('[18-45] 回答数：ページ送り', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    // 更新日時は未回答のユーザーが全員 NULL で並びが決まらないため、重複しないユーザー表示名順で確かめる
    const first = await readPaged<UserFeedbackItem>(await fb.sortBy('count', 'ユーザー表示名順'));
    expect(first.totalPages).toBeGreaterThan(1);
    const second = await bodyOf<UserFeedbackItem>(await fb.goToNextPage('count'));
    expect(second.length).toBeGreaterThan(0);
    expect(second.some((item) => first.content.map((f) => f.user.id).includes(item.user.id))).toBe(false);
    await expect(fb.countText).toHaveText(countText(first.totalElements, 1));
  });

  test('[18-46] 回答数：0件', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('count');
    // 「未回答」かつ「★5 の評価がある」ユーザーは、DB でもいない組み合わせにする
    const empty = sqlNumber(`
      SELECT count(*) FROM users u WHERE u.tenant_id = ${quote(TENANT_ID)}
        AND NOT EXISTS (SELECT 1 FROM message_feedbacks f WHERE f.user_id = u.id)
        AND EXISTS (SELECT 1 FROM rooms r WHERE r.user_id = u.id AND r.rating = 'EXCELLENT')`);
    expect(empty).toBe(0);
    await fb.applyFilter('count', 0, M.noResponse);
    const response = await fb.applyFilter('count', 1, '★★★★★');
    expect((await readPaged<UserFeedbackItem>(response)).totalElements).toBe(0);
    await expect(fb.rows).toHaveCount(0);
    await expect(fb.emptyMessage).toBeVisible();
  });

  test('[18-47] 3タブ切替確認', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    await expect(fb.filter(2)).toBeVisible();
    await fb.switchTab('satisfaction');
    await expect(fb.filter(2)).toBeVisible();
    await expect(fb.main.getByText('★').first()).toBeVisible();
    await fb.switchTab('count');
    await expect(fb.filter(1)).toBeVisible();
    await expect(fb.filter(2)).toHaveCount(0);
    await fb.switchTab('accuracy');
    await expect(fb.filter(2)).toBeVisible();
    await expect(fb.rows.first()).toBeVisible();
  });

  test('[18-48] 精度：3フィルター同時適用', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open();
    await fb.applyFilter('accuracy', 0, HELP_DESK_ASSISTANT_NAME);
    await fb.applyFilter('accuracy', 1, M.accurate);
    const response = await fb.applyFilter('accuracy', 2, FAQ_FOLDER_NAME);
    const items = await bodyOf<MessageFeedbackItem>(response);
    const total = accuracyCount(
      `AND m.assistant_id = ${quote(HELP_DESK_ASSISTANT_ID)} AND f.rating = 'GOOD' AND f.index_id = ${quote(FAQ_FOLDER_ID)}`
    );
    expect(total).toBeGreaterThan(0);
    expect(items.length).toBe(expectedRowCount(total));
    await expect(fb.countText).toHaveText(countText(total));
    expect((await fb.readRows()).every((row) => row[0] === HELP_DESK_ASSISTANT_NAME && row[1] === M.accurate && row[5] === FAQ_FOLDER_NAME)).toBe(
      true
    );
  });

  test('[18-49] 満足度：フィルター＋並替', async ({ page }) => {
    const fb = new FeedbackPage(page);
    await fb.open('satisfaction');
    await fb.applyFilter('satisfaction', 1, '★★★☆☆');
    const response = await fb.sortBy('satisfaction', 'チャット名順');
    const items = await bodyOf<RoomFeedbackItem>(response);
    expect(items.every((item) => item.rating === 'GOOD')).toBe(true);
    const expected = sql(
      `SELECT name FROM rooms WHERE tenant_id = ${quote(TENANT_ID)} AND rating = 'GOOD' ORDER BY name DESC LIMIT ${FEEDBACK_PAGE_SIZE}`
    ).map((row) => row[0]);
    expect(items.map((item) => item.room.name)).toEqual(expected);
  });

  test('[18-50] 精度：選択→一括学習先指定', async () => {
    test.skip(true, '移植元の現行 client（accuracy-tab）に複数選択・一括の学習先指定がなく、移植元の画面にない操作のため');
  });

  test('[18-51] フォルダ未選択', async ({ page }) => {
    const fixture = createFeedbackFixture({ label: '未選択', messageRating: 'BAD' });
    try {
      const fb = new FeedbackPage(page);
      await fb.open();
      const row = fb.rows.filter({ hasText: fixture.question });
      await openFolderDialog(page, row);
      // フォルダを選ばないと「追加学習」を押せない
      await expect(page.getByTestId('dialog-confirm-button')).toBeDisabled();
      await expect(page.getByRole('dialog').getByPlaceholder(M.folderPlaceholder)).toBeVisible();
      expect(sql(`SELECT coalesce(index_id, '') FROM message_feedbacks WHERE id = ${quote(fixture.feedbackId)}`)[0][0]).toBe('');
    } finally {
      deleteFeedbackFixture(fixture);
    }
  });

  test('[18-52] フィードバック Chrome', async ({ page, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で 3 タブを操作する
    expect(browserName).toBe('chromium');
    const fb = new FeedbackPage(page);
    await fb.open();
    await fb.applyFilter('accuracy', 1, M.accurate);
    await expect(fb.rows.first()).toBeVisible();
    await fb.switchTab('satisfaction');
    await fb.applyFilter('satisfaction', 1, '★★★★★');
    await expect(fb.rows.first()).toBeVisible();
    await fb.switchTab('count');
    await fb.applyFilter('count', 0, M.responded);
    await expect(fb.rows.first()).toBeVisible();
    await fb.sortBy('count', '精度評価数順');
    await expect(fb.rows.first()).toBeVisible();
  });
});

function usersWithFeedbackCount(): number {
  return sqlNumber(`SELECT count(DISTINCT user_id) FROM message_feedbacks WHERE tenant_id = ${quote(TENANT_ID)}`);
}

/** 行メニューから「学習先フォルダを指定」を開く。 */
async function openFolderDialog(page: Page, row: Locator): Promise<void> {
  await expect(row).toHaveCount(1);
  // 行メニューのボタンは data-testid="feedback-menu-<行の ID>"（回答精度はフィードバック ID、満足度はルーム ID）
  await row.locator('[data-testid^="feedback-menu-"]').click();
  await page.getByRole('button', { name: M.specifyFolder }).click();
  await expect(page.getByTestId('dialog-confirm-button')).toBeVisible();
}

/** 行メニュー → 学習先フォルダを選ぶ → 追加学習、までを行い、登録の応答を待つ。 */
async function specifyFolder(
  page: Page,
  fb: FeedbackPage,
  row: Locator,
  tab: FeedbackTab,
  folderName: string
): Promise<void> {
  await openFolderDialog(page, row);
  const dialog = page.getByRole('dialog');
  const folderTrigger = dialog.locator('[aria-haspopup="listbox"]:not(input)').first();
  await chooseOption(page, folderTrigger, folderName);
  const learned = page.waitForResponse((r) => /\/additionalLearning$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  const reloaded = fb.page.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith(tab === 'accuracy' ? '/feedbackMessage' : '/feedbackRoom') && r.request().method() === 'GET'
  );
  await page.getByTestId('dialog-confirm-button').click();
  const result = await learned;
  // 登録後に画面が一覧を読み直すため、応答の本文は読めない（状態だけ確かめる）
  expect(result.status(), `追加学習 API が失敗: ${result.status()}`).toBeLessThan(300);
  await reloaded;
}
