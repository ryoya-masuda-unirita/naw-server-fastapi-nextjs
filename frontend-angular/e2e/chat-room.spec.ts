import { test, expect } from './fixtures/auth.fixture';
import type { Page } from '@playwright/test';

// 10_チャットルーム.md 対応。
//
// 除外した項目とその理由:
// - 項番5/6（ピン留め/解除 Chrome）: 項番3/4と同一手順のため、
//   playwright.config.tsのchromiumプロジェクト実行で代表させ、個別テスト化しない
// - 項番8（個別削除 Chrome）: 項番7と同一手順のため、同上の理由で個別テスト化しない
//
// このカテゴリのテストは名前変更・ピン留め・削除等サイドバーのチャット一覧を破壊的に変更するため、
// backend/seed.sqlに専用ルーム「チャットルーム操作確認用ルーム1/2/3」を追加した
// （chat-search.spec.tsが依存する検索確認用ルームとの副作用を避けるため）。
// ルーム3は「表示中チャットの削除」テスト専用（削除すると恒久的に一覧から消えるため、
// 他のテストが使うルーム1と分離する）。
//
// サイドバーのチャット一覧は「検索確認用ルーム」25件を含む多数のルームを保持するAPIから
// 取得した一部のみを表示するため、フィードバック確認用ルーム等の古いルームは一覧に
// 表示されないことがある。本カテゴリのテストは常に表示される専用ルームのみを使う。
//
// セレクタについて: ルームのメニュー起動ボタン(操作メニュー)はCSSの`group-hover`で
// ホバー時のみ表示されるため、対象行を`hover()`してからクリックする。

function getRoomLink(page: Page, roomName: string) {
  return page.locator('a').filter({ hasText: roomName });
}

async function openRoomMenu(page: Page, roomName: string): Promise<void> {
  const room = getRoomLink(page, roomName);
  const menuButton = room.getByLabel('操作メニュー');
  // サイドバーのチャット一覧は縦スクロールするため、ホバー前に対象行を表示領域に入れる
  await room.scrollIntoViewIfNeeded();

  // group-hoverでのボタン表示は、並列実行時の負荷でCSSの:hover反映が遅れて
  // 一度で表示されないことがあるため、表示されるまでhoverをリトライする
  await expect(async () => {
    await room.hover();
    await expect(menuButton).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });

  await menuButton.click();
  // メニューは開閉アニメーションを伴うため、安定表示を待ってから操作する
  await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).waitFor({ state: 'visible' });
}

function sidebarMenu(page: Page) {
  return page.getByRole('complementary');
}

// サイドバーのチャット一覧という共有状態を変更するテストのため、並列実行による競合を避け直列実行する
test.describe.configure({ mode: 'serial' });

test.describe('チャットルーム', () => {
  test('サイドバーから既存チャットをクリックするとチャットルームに遷移し過去メッセージが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('チャットルーム操作確認用ルーム1', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);
    await expect(page.getByText('チャットルーム操作確認用の質問メッセージ')).toBeVisible();
    await expect(page.getByText('チャットルーム操作確認用の回答メッセージ')).toBeVisible();
  });

  test('メニューから名前を変更するとサイドバーとヘッダーの名前が更新されること', async ({
    authenticatedPage: page,
  }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム1');
    await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'チャット名を入力' }).fill('名前変更後のルーム1');
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText('名前変更後のルーム1', { exact: true }).first()).toBeVisible();

    // 後続テストへの影響を避けるため元の名前に戻す
    await openRoomMenu(page, '名前変更後のルーム1');
    await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'チャット名を入力' }).fill('チャットルーム操作確認用ルーム1');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(
      page.getByText('チャットルーム操作確認用ルーム1', { exact: true }).first(),
    ).toBeVisible();
  });

  test('メニューからピン留めするとチャットが上部に固定表示されること', async ({
    authenticatedPage: page,
  }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await sidebarMenu(page).getByText('上部に固定', { exact: true }).click();

    // ピン留め状態はメニューの表示切り替え（「上部に固定」→「上部に固定を解除」）で確認する
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await expect(sidebarMenu(page).getByText('上部に固定を解除', { exact: true })).toBeVisible();

    // 後続テストへの影響を避けるためピン留めを解除する
    await sidebarMenu(page).getByText('上部に固定を解除', { exact: true }).click();
  });

  test('ピン留め解除すると固定が解除されること', async ({ authenticatedPage: page }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await sidebarMenu(page).getByText('上部に固定', { exact: true }).click();
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await expect(sidebarMenu(page).getByText('上部に固定を解除', { exact: true })).toBeVisible();
    await sidebarMenu(page).getByText('上部に固定を解除', { exact: true }).click();

    // 解除後は再びメニューに「上部に固定」が表示される（=固定が解除された状態に戻った）
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await expect(sidebarMenu(page).getByText('上部に固定', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('メニューから削除するとチャットが一覧から削除されること', async ({
    authenticatedPage: page,
  }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム2');
    await sidebarMenu(page).getByText('チャットを削除', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('このチャットを削除してもよろしいですか？この操作は元に戻せません。'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(getRoomLink(page, 'チャットルーム操作確認用ルーム2')).not.toBeVisible();
  });

  test('削除確認でキャンセルするとチャットは削除されないこと', async ({
    authenticatedPage: page,
  }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム1');
    await sidebarMenu(page).getByText('チャットを削除', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();

    await expect(getRoomLink(page, 'チャットルーム操作確認用ルーム1')).toBeVisible();
  });

  test('表示中のチャットを削除すると別画面に遷移すること', async ({ authenticatedPage: page }) => {
    // 削除すると恒久的に一覧から消えるため、後続テストが使う「ルーム1」とは別の専用ルームを使う
    await page.getByText('チャットルーム操作確認用ルーム3', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);

    await openRoomMenu(page, 'チャットルーム操作確認用ルーム3');
    await sidebarMenu(page).getByText('チャットを削除', { exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除' }).click();

    await page.waitForURL('/chat/new');
  });

  test('空の名前で変更を試行すると保存ボタンが無効化されること', async ({
    authenticatedPage: page,
  }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム1');
    await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    const nameInput = dialog.getByRole('textbox', { name: 'チャット名を入力' });
    await nameInput.fill('');
    // src/app/core/utils/room-name.helpers.ts の isValidRoomName() により
    // trim後に空文字だと保存ボタンが無効化される
    await expect(dialog.getByRole('button', { name: '保存' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
  });

  test('最大長の名前で変更すると正常に保存されること', async ({ authenticatedPage: page }) => {
    await openRoomMenu(page, 'チャットルーム操作確認用ルーム1');
    await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).click();

    // 移植元の備考「255文字で保存できる」に合わせて255文字で検証する
    const maxLengthName = 'あ'.repeat(255);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'チャット名を入力' }).fill(maxLengthName);
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText(maxLengthName, { exact: true }).first()).toBeVisible();

    // 後続テストへの影響を避けるため元の名前に戻す
    await openRoomMenu(page, maxLengthName);
    await sidebarMenu(page).getByText('チャットの名前を変更', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'チャット名を入力' }).fill('チャットルーム操作確認用ルーム1');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(
      page.getByText('チャットルーム操作確認用ルーム1', { exact: true }).first(),
    ).toBeVisible();
  });

  test('サイドバーからルーム1を選択すると正しいルームが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByText('チャットルーム操作確認用ルーム1', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);
    await expect(page.getByRole('heading', { name: 'チャットルーム操作確認用ルーム1' })).toBeVisible();
  });

  test('サイドバーからルーム2を選択すると正しいルームが表示されること', async ({
    authenticatedPage: page,
  }) => {
    // 「チャットルーム操作確認用ルーム2」は項番7の削除テストで削除済みのため、
    // 常にサイドバー上位に表示される「検索確認用ルーム01」をルーム2として使用する
    await page.getByText('検索確認用ルーム01', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);
    await expect(page.getByRole('heading', { name: '検索確認用ルーム01' })).toBeVisible();
  });
});
