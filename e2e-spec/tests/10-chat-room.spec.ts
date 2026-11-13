import type { APIRequestContext } from '@playwright/test';
import { addConversation, createRoom, listRooms, loginAsUser, type CreatedRoom } from '../src/api-rooms.ts';
import type { CreatedUser } from '../src/api.ts';
import { expect, test as base } from '../src/fixtures.ts';
import { SidebarPage } from '../src/pages/sidebar.page.ts';

/**
 * 10_チャットルーム（16 項目）。項目書: 25DA61_結合テスト項目書_md/10_チャットルーム.md
 *
 * 移植元との対応:
 * - 画面の文言は「チャットの名前を変更」「上部に固定」「上部に固定を解除」「チャットを削除」（SIDEBAR.*）
 * - 項番 5・6・8 の Chrome は Playwright の Chromium（Chrome と同じエンジン）
 * - 前提の「チャットルームが2つ以上ある状態」は、テスト専用のユーザーに 2 つのルームを API で作って用意する
 * - ルームの持ち主は、テストごとに作る専用ユーザー。ルームはユーザーの削除でまとめて消える
 */

const MENU = {
  rename: 'チャットの名前を変更',
  pin: '上部に固定',
  unpin: '上部に固定を解除',
  delete: 'チャットを削除',
} as const;
/** ルーム名の最大長（項目書 10-14 の備考: 255 文字）。 */
const ROOM_NAME_MAX_LENGTH = 255;

interface RoomFixtures {
  /** 専用ユーザー（ログイン済みの画面と API を持つ）。 */
  owner: CreatedUser;
  ownerApi: APIRequestContext;
  /** 専用ユーザーのルーム 2 つ。画面でログイン済みで、サイドバーに出ている。 */
  rooms: { first: CreatedRoom; second: CreatedRoom };
  sidebar: SidebarPage;
}

const test = base.extend<RoomFixtures>({
  owner: async ({ createUser }, use) => {
    await use(await createUser({}));
  },

  ownerApi: async ({ owner }, use) => {
    const api = await loginAsUser(owner);
    await use(api);
    await api.dispose();
  },

  rooms: async ({ ownerApi, uniqueId }, use) => {
    const first = await createRoom(ownerApi, uniqueId('room-a'));
    const second = await createRoom(ownerApi, uniqueId('room-b'));
    await use({ first, second });
  },

  sidebar: async ({ page, loginPage, owner, rooms }, use) => {
    // rooms を依存に入れて、ログイン前にルームを作っておく（サイドバーの一覧に出るようにする）
    void rooms;
    await loginPage.login(owner);
    await use(new SidebarPage(page));
  },
});

/** ルームの現在の状態（名前・固定）を API から取る。 */
async function roomState(api: APIRequestContext, id: string) {
  return (await listRooms(api)).find((room) => room.id === id);
}

test.describe('10_チャットルーム', () => {
  test('[10-01] ルーム遷移', async ({ sidebar, page, owner, rooms }) => {
    const question = 'ルーム遷移の確認用の質問です';
    const answer = 'ルーム遷移の確認用の回答です';
    addConversation(owner.tenantId, rooms.first.id, question, answer);
    await sidebar.room(rooms.first.name).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${rooms.first.id}`));
    // 過去のメッセージ（質問と回答）が表示される
    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByText(answer)).toBeVisible();
  });

  test('[10-02] 名前変更', async ({ sidebar, page, rooms, uniqueId }) => {
    const newName = uniqueId('renamed');
    await sidebar.room(rooms.first.name).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${rooms.first.id}`));
    await sidebar.selectRoomMenu(rooms.first.name, MENU.rename);
    await sidebar.dialog.getByRole('textbox').fill(newName);
    await sidebar.dialog.getByRole('button', { name: '保存' }).click();
    // サイドバーとヘッダーの名前が更新される
    await expect(sidebar.room(newName)).toBeVisible();
    await expect(sidebar.room(rooms.first.name)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
  });

  test('[10-03] ピン留め', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.second.name, MENU.pin);
    // チャットが上部に固定表示される（一覧の先頭に出る）
    await expect(sidebar.roomItems.first()).toContainText(rooms.second.name);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(true);
  });

  test('[10-04] ピン留め解除', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.second.name, MENU.pin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(true);
    await sidebar.selectRoomMenu(rooms.second.name, MENU.unpin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(false);
  });

  test('[10-05] ピン留め Chrome', async ({ sidebar, ownerApi, rooms, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await sidebar.selectRoomMenu(rooms.second.name, MENU.pin);
    await expect(sidebar.roomItems.first()).toContainText(rooms.second.name);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(true);
  });

  test('[10-06] ピン留め解除 Chrome', async ({ sidebar, ownerApi, rooms, browserName }) => {
    expect(browserName).toBe('chromium');
    await sidebar.selectRoomMenu(rooms.second.name, MENU.pin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(true);
    await sidebar.selectRoomMenu(rooms.second.name, MENU.unpin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(false);
  });

  test('[10-07] 個別削除', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.first.name, MENU.delete);
    await sidebar.dialog.getByRole('button', { name: '削除' }).click();
    // チャットが一覧から削除される
    await expect(sidebar.room(rooms.first.name)).toHaveCount(0);
    await expect.poll(async () => await roomState(ownerApi, rooms.first.id)).toBeUndefined();
  });

  test('[10-08] 個別削除 Chrome', async ({ sidebar, ownerApi, rooms, browserName }) => {
    expect(browserName).toBe('chromium');
    await sidebar.selectRoomMenu(rooms.first.name, MENU.delete);
    await sidebar.dialog.getByRole('button', { name: '削除' }).click();
    await expect(sidebar.room(rooms.first.name)).toHaveCount(0);
    await expect.poll(async () => await roomState(ownerApi, rooms.first.id)).toBeUndefined();
  });

  test('[10-09] 削除キャンセル', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.first.name, MENU.delete);
    await sidebar.dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(sidebar.dialog).toBeHidden();
    // チャットは削除されない
    await expect(sidebar.room(rooms.first.name)).toBeVisible();
    expect(await roomState(ownerApi, rooms.first.id)).toBeDefined();
  });

  test('[10-10] 削除後画面遷移', async ({ sidebar, page, rooms }) => {
    await sidebar.room(rooms.first.name).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${rooms.first.id}`));
    await sidebar.selectRoomMenu(rooms.first.name, MENU.delete);
    await sidebar.dialog.getByRole('button', { name: '削除' }).click();
    // 表示中のチャットを削除すると別画面（新規チャット）に遷移する
    await expect(page).not.toHaveURL(new RegExp(`/chat/${rooms.first.id}`));
    await expect(sidebar.room(rooms.first.name)).toHaveCount(0);
  });

  test('[10-11] ピン留め操作-1', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.first.name, MENU.pin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.first.id))?.pinned).toBe(true);
    // もう一方のチャットは固定されない
    expect((await roomState(ownerApi, rooms.second.id))?.pinned).toBe(false);
    await sidebar.selectRoomMenu(rooms.first.name, MENU.unpin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.first.id))?.pinned).toBe(false);
  });

  test('[10-12] ピン留め操作-2', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.second.name, MENU.pin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(true);
    expect((await roomState(ownerApi, rooms.first.id))?.pinned).toBe(false);
    await sidebar.selectRoomMenu(rooms.second.name, MENU.unpin);
    await expect.poll(async () => (await roomState(ownerApi, rooms.second.id))?.pinned).toBe(false);
  });

  test('[10-13] 名前変更空文字', async ({ sidebar, ownerApi, rooms }) => {
    await sidebar.selectRoomMenu(rooms.first.name, MENU.rename);
    await sidebar.dialog.getByRole('textbox').fill('');
    // 空の名前は保存できない（保存ボタンが押せない、または検証エラーが出る）。名前のないチャットができてはいけない
    const save = sidebar.dialog.getByRole('button', { name: '保存' });
    if (await save.isEnabled()) await save.click();
    else await expect(save).toBeDisabled();
    expect((await roomState(ownerApi, rooms.first.id))?.name).toBe(rooms.first.name);
  });

  test('[10-14] 名前変更最大長', async ({ sidebar, ownerApi, rooms }) => {
    const longName = 'あ'.repeat(ROOM_NAME_MAX_LENGTH);
    await sidebar.selectRoomMenu(rooms.first.name, MENU.rename);
    await sidebar.dialog.getByRole('textbox').fill(longName);
    await sidebar.dialog.getByRole('button', { name: '保存' }).click();
    await expect.poll(async () => (await roomState(ownerApi, rooms.first.id))?.name).toBe(longName);
  });

  test('[10-15] ルーム選択-1', async ({ sidebar, page, owner, rooms }) => {
    addConversation(owner.tenantId, rooms.first.id, '1つ目のルームの質問', '1つ目のルームの回答');
    addConversation(owner.tenantId, rooms.second.id, '2つ目のルームの質問', '2つ目のルームの回答');
    await sidebar.room(rooms.first.name).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${rooms.first.id}`));
    await expect(page.getByText('1つ目のルームの質問')).toBeVisible();
    await expect(page.getByText('2つ目のルームの質問')).toHaveCount(0);
  });

  test('[10-16] ルーム選択-2', async ({ sidebar, page, owner, rooms }) => {
    addConversation(owner.tenantId, rooms.first.id, '1つ目のルームの質問', '1つ目のルームの回答');
    addConversation(owner.tenantId, rooms.second.id, '2つ目のルームの質問', '2つ目のルームの回答');
    await sidebar.room(rooms.second.name).click();
    await expect(page).toHaveURL(new RegExp(`/chat/${rooms.second.id}`));
    await expect(page.getByText('2つ目のルームの質問')).toBeVisible();
    await expect(page.getByText('1つ目のルームの質問')).toHaveCount(0);
  });
});
