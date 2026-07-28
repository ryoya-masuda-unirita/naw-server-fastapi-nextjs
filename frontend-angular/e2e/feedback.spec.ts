import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// 18_フィードバック管理.md 対応。
//
// 除外した項目とその理由:
// - 項番16〜19（精度：一括選択/一括学習先指定/全選択/選択解除）・項番35（満足度：一括学習先指定）・
//   項番50（精度：選択→一括学習先指定）: `accuracy-tab.component.ts`/`satisfaction-tab.component.ts`に
//   チェックボックス選択・一括操作のロジックが一切実装されておらず（`showCheckbox`未使用）、UIが未実装のため対象外
// - 項番52（フィードバック Chrome）: 項番1と同一手順のためchromiumプロジェクト実行で代表、個別テスト化せず
//
// 各タブのページ送り確認(5件/ページ)に十分な件数が必要なため、backend/seed.sqlに
// 回答精度評価確認用メッセージ・フィードバック6件、チャット満足度確認用ルーム6件を追加した。

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('テナントID').fill('test-tenant');
  await page.getByPlaceholder('ユーザーID').fill('admin');
  await page.getByPlaceholder('パスワード').fill('admin@1234');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/dashboard');
}

function rowLocator(page: Page) {
  return page.locator('.table-list-row--data');
}

// フィードバック一覧の複数タブという共有状態を扱うため、直列実行する
test.describe.configure({ mode: 'serial' });

test.describe('フィードバック管理', () => {
  test('管理コンソール→「フィードバック管理」を開くと3タブが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await expect(page.getByRole('button', { name: '回答精度評価' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'チャット満足度' })).toBeVisible();
    await expect(page.getByRole('button', { name: '回答数一覧' })).toBeVisible();
  });

  test('「回答精度評価」タブを選択すると精度一覧が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();

    await expect(page.getByText('精度確認用質問', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('アシスタント表示名', { exact: true })).toBeVisible();
  });

  test('精度：アシスタントフィルターで特定アシスタントを選択すると該当アシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用02' }).click();

    await expect(page.getByText('精度確認用質問06', { exact: false })).toBeVisible();
    await expect(page.getByText(/\d+-\d+件 \/ 1件/).first()).toBeVisible();
  });

  test('精度：精度フィルターで「不正確」を選択すると不正確と評価されたデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await page.getByText('全ての精度', { exact: true }).click();
    await page.getByRole('option', { name: '不正確' }).click();

    await expect(page.getByText('精度確認用質問05', { exact: false })).toBeVisible();
  });

  test('精度：精度フィルターで「正確」を選択すると正確と評価されたデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await page.getByText('全ての精度', { exact: true }).click();
    await page.getByRole('option', { name: '正確', exact: true }).click();

    await expect(page.getByText('精度確認用質問', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('精度確認用質問05', { exact: false })).not.toBeVisible();
  });

  test('精度：学習先フォルダフィルターで特定フォルダを選択すると該当フォルダのデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await page.getByPlaceholder('全ての学習先フォルダ').click();
    await page.getByRole('option', { name: '学習データ確認用クラウドフォルダ' }).click();

    await expect(page.getByText('精度確認用質問01', { exact: false })).toBeVisible();
    await expect(page.getByText('精度確認用質問02', { exact: false })).not.toBeVisible();
  });

  test('精度：並べ替えで「更新日時順」を選択すると更新日時順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '更新日時順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：並べ替えで「アシスタント名順」を選択するとアシスタント名順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：並べ替えで「精度順」を選択すると精度順に表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '精度順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：並べ替えで「追加学習順」を選択すると追加学習(ON/OFF)順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '追加学習順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：並べ替えで「学習先フォルダ順」を選択すると学習先フォルダ順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '学習先フォルダ名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：並べ替えの昇順・降順を切り替えると表示順が切り替わること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();
    await expect(rowLocator(page).first()).toBeVisible();

    await page.getByText('アシスタント表示名順', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: '降順' })).toBeVisible();
    await page.getByRole('button', { name: '降順' }).click({ force: true });

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：ページ送りで次ページに移動すると次ページのデータが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).first().click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('精度：フィルター行の件数表示を確認すると件数が正しく表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
  });

  test('精度：行メニュー→「学習先フォルダを指定」でフォルダを選択して保存すると学習先フォルダが更新されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();

    const row = rowLocator(page).filter({ hasText: '精度確認用質問02' });
    await row.locator('[class*=table-list-actions]').getByRole('button').last().click();
    await page.getByText('学習先フォルダを指定', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('学習先フォルダを選択').click();
    await page.getByRole('option', { name: '学習データ確認用クラウドフォルダ' }).click();
    await dialog.getByRole('button', { name: '追加学習' }).click();

    await expect(dialog).not.toBeVisible();
  });

  test('精度：該当データが0件のフィルター条件で表示すると空状態が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用02' }).click();
    await page.getByText('全ての精度', { exact: true }).click();
    await page.getByRole('option', { name: '不正確' }).click();

    await expect(page.getByText('データがありません', { exact: true })).toBeVisible();
  });

  test('「チャット満足度」タブを選択すると満足度一覧が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await expect(page.getByText('満足度確認用ルーム01', { exact: true }).first()).toBeVisible();
  });

  test('満足度：アシスタントフィルターで特定アシスタントを選択すると該当アシスタントのデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用02' }).click();

    await expect(page.getByText('満足度確認用ルーム06', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('満足度確認用ルーム01', { exact: true })).not.toBeVisible();
  });

  test('満足度：満足度フィルターで「★☆☆☆☆」を選択すると該当評価のデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('全ての満足度', { exact: true }).click();
    await page.getByRole('option', { name: '★☆☆☆☆' }).click();

    await expect(page.getByText('満足度確認用ルーム05', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('満足度確認用ルーム01', { exact: true })).not.toBeVisible();
  });

  test('満足度：満足度フィルターで「★★★★★」を選択すると該当評価のデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('全ての満足度', { exact: true }).click();
    await page.getByRole('option', { name: '★★★★★' }).click();

    await expect(page.getByText('満足度確認用ルーム01', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('満足度確認用ルーム05', { exact: true })).not.toBeVisible();
  });

  test('満足度：学習先フォルダフィルターで特定フォルダを選択すると該当フォルダのデータのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByPlaceholder('全ての学習先フォルダ').click();
    await page.getByRole('option', { name: '学習データ確認用クラウドフォルダ' }).click();

    await expect(page.getByText(/\d+-\d+件 \/ \d+件|データがありません/).first()).toBeVisible();
  });

  test('満足度：並べ替えで「更新日時順」を選択すると更新日時順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '更新日時順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えで「チャット名順」を選択するとチャット名順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'チャット名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えで「アシスタント名順」を選択するとアシスタント名順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えで「満足度順」を選択すると満足度順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '満足度順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えで「追加学習順」を選択すると追加学習(ON/OFF)順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '追加学習順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えで「学習先フォルダ順」を選択すると学習先フォルダ順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '学習先フォルダ名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：並べ替えの昇順・降順を切り替えると表示順が切り替わること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'チャット名順' }).click();
    await expect(rowLocator(page).first()).toBeVisible();

    await page.getByText('チャット名順', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: '降順' })).toBeVisible();
    await page.getByRole('button', { name: '降順' }).click({ force: true });

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：ページ送りで次ページに移動すると次ページのデータが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).first().click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('満足度：行メニュー→「学習先フォルダを指定」でフォルダを選択して保存すると学習先フォルダが更新されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();

    const row = rowLocator(page).filter({ hasText: '満足度確認用ルーム02' });
    await row.locator('[class*=table-list-actions]').getByRole('button').last().click();
    await page.getByText('学習先フォルダを指定', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('学習先フォルダを選択').click();
    await page.getByRole('option', { name: '学習データ確認用クラウドフォルダ' }).click();
    await dialog.getByRole('button', { name: '追加学習' }).click();

    await expect(dialog).not.toBeVisible();
  });

  test('「回答数一覧」タブを選択するとユーザー別の回答数・満足度集計一覧が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await expect(page.getByText('管理者', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('精度評価数', { exact: true })).toBeVisible();
  });

  test('回答数：回答状況フィルターで「回答あり」を選択すると回答があるユーザーのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('全ての精度評価', { exact: true }).click();
    await page.getByRole('option', { name: '回答済み' }).click();

    await expect(page.getByText('管理者', { exact: true }).last()).toBeVisible();
  });

  test('回答数：回答状況フィルターで「未回答」を選択すると未回答のユーザーのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('全ての精度評価', { exact: true }).click();
    await page.getByRole('option', { name: '未回答' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：満足度フィルターで特定の星評価を選択すると該当満足度のユーザーのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('全ての満足度', { exact: true }).click();
    await page.getByRole('option', { name: '★★★★★' }).click();

    await expect(page.getByText('管理者', { exact: true }).last()).toBeVisible();
  });

  test('回答数：並べ替えで「更新日時順」を選択すると更新日時順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '更新日時順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：並べ替えで「ユーザー名順」を選択するとユーザー名順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'ユーザー表示名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：並べ替えで「精度評価数順」を選択すると精度評価数順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '精度評価数順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：並べ替えで満足度段階(★1)順を選択すると該当列の値順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '★☆☆☆☆順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：並べ替えの昇順・降順を切り替えると表示順が切り替わること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'ユーザー表示名順' }).click();
    await expect(rowLocator(page).first()).toBeVisible();

    await page.getByText('ユーザー表示名順', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: '降順' })).toBeVisible();
    await page.getByRole('button', { name: '降順' }).click({ force: true });

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('回答数：ページ送りで次ページに移動すると次ページのデータが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
  });

  test('回答数：該当データが0件のフィルター条件で表示すると空状態が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: '回答数一覧' }).click();

    await page.getByText('全ての精度評価', { exact: true }).click();
    await page.getByRole('option', { name: '未回答' }).click();
    await page.getByText('全ての満足度', { exact: true }).click();
    await page.getByRole('option', { name: '★★★★★' }).click();

    await expect(page.getByText('データがありません', { exact: true })).toBeVisible();
  });

  test('3タブを順に切り替えると各タブの一覧・フィルターが正しく表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await expect(page.getByPlaceholder('全てのアシスタント')).toBeVisible();
    await page.getByRole('button', { name: 'チャット満足度' }).click();
    await expect(page.getByPlaceholder('全てのアシスタント')).toBeVisible();
    await page.getByRole('button', { name: '回答数一覧' }).click();
    await expect(page.getByText('全ての精度評価', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '回答精度評価' }).click();
    await expect(page.getByPlaceholder('全てのアシスタント')).toBeVisible();
  });

  test('精度：アシスタント・精度・学習先フォルダを同時適用すると全条件を満たす結果が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await page.getByText('全ての精度', { exact: true }).click();
    await page.getByRole('option', { name: '正確', exact: true }).click();
    await page.getByPlaceholder('全ての学習先フォルダ').click();
    await page.getByRole('option', { name: '学習データ確認用クラウドフォルダ' }).click();

    await expect(page.getByText('精度確認用質問01', { exact: false })).toBeVisible();
    await expect(page.getByText('精度確認用質問03', { exact: false })).not.toBeVisible();
  });

  test('満足度：フィルター適用後に並べ替えを変更すると結果が正しく並べ替えられること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');
    await page.getByRole('button', { name: 'チャット満足度' }).click();

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();
    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '満足度順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('学習先フォルダ未選択のまま保存を試行すると保存できないこと', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/feedback');

    await page.getByPlaceholder('全てのアシスタント').click();
    await page.getByRole('option', { name: 'アシスタント確認用01' }).click();

    const row = rowLocator(page).filter({ hasText: '精度確認用質問03' });
    await row.locator('[class*=table-list-actions]').getByRole('button').last().click();
    await page.getByText('学習先フォルダを指定', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '追加学習' })).toBeDisabled();
  });
});
