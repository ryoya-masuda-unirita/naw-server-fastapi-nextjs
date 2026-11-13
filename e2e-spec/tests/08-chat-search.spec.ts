import type { Page } from '@playwright/test';
import { searchRooms } from '../src/api-chat.ts';
import { expect, test } from '../src/fixtures-chat.ts';
import { ChatPage, CHAT_TEXT } from '../src/pages/chat.page.ts';

/**
 * 08_チャット検索（15 項目）。項目書: 25DA61_結合テスト項目書_md/08_チャット検索.md
 *
 * 移植元との対応:
 * - 検索の対象は、ログインしているユーザーのルーム名（GET /api/rooms?name=）。他のテストのルームと混ざらないよう、
 *   テストごとに他と重ならない接頭辞のルームを API で作り、その接頭辞で検索する
 * - 1 ページの件数は 20 件（移植元 SEARCH_PAGE_SIZE）。ページ送りの確認では 21 件作る
 * - 「Chrome」の項目は、このテストが Chromium（Chrome と同じ描画エンジン）で動くため、同じ操作を確かめる
 */

const SEARCH_PAGE_SIZE = 20;
/** 検索結果の日付の表示形式（yyyy/MM/dd）。 */
const DATE_PATTERN = /\d{4}\/\d{2}\/\d{2}/;

/** サイドバーの「チャットを検索」を押して、検索のモーダルを開く。 */
async function openSearchModal(page: Page): Promise<void> {
  await page.getByTestId('chat-search-button').click();
  await expect(page.getByRole('dialog').getByText(CHAT_TEXT.searchModalTitle).first()).toBeVisible();
}

function searchInput(page: Page) {
  return page.getByTestId('chat-search-input');
}

function resultItems(page: Page) {
  return page.getByTestId('chat-search-result-item');
}

test.describe('08_チャット検索', () => {
  test('[08-01] 検索モーダル表示', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await expect(searchInput(page)).toBeVisible();
  });

  test('[08-02] キーワード検索（ヒットあり）', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('find');
    const room = await makeRoom({ name: `${prefix}-chat` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    await expect(resultItems(page)).toHaveCount(1);
    await expect(resultItems(page).first()).toContainText(room.name);
  });

  test('[08-03] キーワード検索（0件）', async ({ loginAs, page, uniqueId }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(uniqueId('nothing-matches'));
    await expect(page.getByText(CHAT_TEXT.searchEmpty)).toBeVisible();
    await expect(resultItems(page)).toHaveCount(0);
  });

  test('[08-04] 検索結果内容確認', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('content');
    const room = await makeRoom({ name: `${prefix}-chat`, messages: ['内容確認の質問'] });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    const item = resultItems(page).first();
    // チャット名と日付が表示される
    await expect(item).toContainText(room.name);
    await expect(item).toContainText(DATE_PATTERN);
  });

  test('[08-05] 検索結果からルーム遷移', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('jump');
    const room = await makeRoom({ name: `${prefix}-chat`, messages: ['遷移の確認'] });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    await resultItems(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/chat/${room.id}$`));
    await expect(chat.userMessages.first()).toContainText('遷移の確認');
  });

  test('[08-06] 検索クリア', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('clear');
    await makeRoom({ name: `${prefix}-chat` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    await expect(resultItems(page)).toHaveCount(1);
    // クリアボタンの aria-label は i18n キー（COMMON.CLEAR）が ja.json になく、移植元も同じ。名前ではなくクラスで探す
    await page.getByRole('dialog').locator('button.combobox-clear').click();
    await expect(searchInput(page)).toHaveValue('');
    await expect(resultItems(page)).toHaveCount(0);
  });

  test('[08-07] 検索デバウンス', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('debounce');
    await makeRoom({ name: `${prefix}-chat` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);

    const searchRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/api/rooms' && url.searchParams.has('name')) {
        searchRequests.push(url.searchParams.get('name') ?? '');
      }
    });
    // 1 文字ずつ高速に入力する（間隔はデバウンスの待ち時間より十分短い）
    await searchInput(page).pressSequentially(prefix, { delay: 10 });
    await expect(resultItems(page)).toHaveCount(1);
    // 入力の途中の語では検索せず、入力が終わった語（全文）で検索する
    expect(searchRequests).toContain(prefix);
    expect(searchRequests.length).toBeLessThanOrEqual(2);
  });

  test('[08-08] ページ送り', async ({ loginAs, page, chatApi, uniqueId }) => {
    const prefix = uniqueId('paging');
    const api = await chatApi('user');
    // 20 件を超える検索結果を用意する（1 ページ 20 件）
    const { createRoom, deleteRoom } = await import('../src/api-chat.ts');
    const rooms = await Promise.all(
      Array.from({ length: SEARCH_PAGE_SIZE + 1 }, (_, i) => createRoom(api, `${prefix}-${String(i).padStart(2, '0')}`))
    );
    try {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openSearchModal(page);
      await searchInput(page).fill(prefix);
      await expect(resultItems(page)).toHaveCount(SEARCH_PAGE_SIZE);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: '2', exact: true }).click();
      await expect(resultItems(page)).toHaveCount(1);
      await expect(dialog.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    } finally {
      await Promise.all(rooms.map((room) => deleteRoom(api, room.id)));
    }
  });

  test('[08-09] 部分一致検索', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('partial');
    const room = await makeRoom({ name: `${prefix}-ここが中間-end` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    // 名前の途中の一部だけを入力する
    await searchInput(page).fill('ここが中間');
    await expect(resultItems(page).filter({ hasText: room.name })).toHaveCount(1);
  });

  test('[08-10] モーダル閉じる', async ({ loginAs, page }) => {
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('[08-11] 1文字検索', async ({ loginAs, page, makeRoom, uniqueId }) => {
    // 1 文字の語はほかのルームにも当たる。作ったルームの名前に固有の 1 文字を入れ、結果に含まれることを確かめる
    const marker = '鬱';
    const room = await makeRoom({ name: `${uniqueId('one')}-${marker}` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(marker);
    await expect(resultItems(page).filter({ hasText: room.name })).toHaveCount(1);
  });

  test('[08-12] 特殊文字検索', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const special = "%_\\'\"<>&;--";
    const room = await makeRoom({ name: `${uniqueId('sp')}${special}` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    const failed: number[] = [];
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname === '/api/rooms' && response.status() >= 400) failed.push(response.status());
    });
    await searchInput(page).fill(special);
    // エラーなく検索でき、特殊文字を名前に含むルームが見つかる（% や _ をワイルドカードとして扱わない）
    await expect(resultItems(page).filter({ hasText: room.name })).toHaveCount(1);
    expect(failed).toEqual([]);
  });

  test('[08-13] 検索結果1件', async ({ loginAs, page, makeRoom, uniqueId }) => {
    const prefix = uniqueId('single');
    const room = await makeRoom({ name: `${prefix}-only` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    await expect(resultItems(page)).toHaveCount(1);
    await expect(resultItems(page).first()).toContainText(room.name);
  });

  test('[08-14] 検索＋ページ送り＋遷移', async ({ loginAs, page, chatApi, uniqueId }) => {
    const prefix = uniqueId('combo');
    const api = await chatApi('user');
    const { createRoom, deleteRoom } = await import('../src/api-chat.ts');
    const rooms = await Promise.all(
      Array.from({ length: SEARCH_PAGE_SIZE + 1 }, (_, i) => createRoom(api, `${prefix}-${String(i).padStart(2, '0')}`))
    );
    try {
      const chat = new ChatPage(page);
      await loginAs('user');
      await chat.gotoDashboard();
      await openSearchModal(page);
      await searchInput(page).fill(prefix);
      await expect(resultItems(page)).toHaveCount(SEARCH_PAGE_SIZE);
      await page.getByRole('dialog').getByRole('button', { name: '2', exact: true }).click();
      await expect(resultItems(page)).toHaveCount(1);
      // 2 ページ目の 1 件（検索結果は新しい順。どのルームかは API の結果で確かめる）
      const onSecondPage = await resultItems(page).first().innerText();
      await resultItems(page).first().click();
      await expect(page).toHaveURL(/\/chat\/[^/?#]+$/);
      const found = await searchRooms(api, prefix);
      const target = rooms.find((room) => new URL(page.url()).pathname.endsWith(room.id));
      expect(target, '遷移先が検索したルームのどれか').toBeTruthy();
      expect(found.length).toBe(SEARCH_PAGE_SIZE + 1);
      expect(onSecondPage).toContain(target?.name ?? '');
    } finally {
      await Promise.all(rooms.map((room) => deleteRoom(api, room.id)));
    }
  });

  test('[08-15] チャット検索 Chrome', async ({ loginAs, page, makeRoom, uniqueId, browserName }) => {
    // このテストは Chromium（Chrome と同じ描画エンジン）で動く
    expect(browserName).toBe('chromium');
    const prefix = uniqueId('chrome');
    const room = await makeRoom({ name: `${prefix}-chat` });
    const chat = new ChatPage(page);
    await loginAs('user');
    await chat.gotoDashboard();
    await openSearchModal(page);
    await searchInput(page).fill(prefix);
    await expect(resultItems(page).first()).toContainText(room.name);
  });
});
