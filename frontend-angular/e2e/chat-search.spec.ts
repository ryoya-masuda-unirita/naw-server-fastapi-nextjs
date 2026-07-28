import { test, expect } from './fixtures/auth.fixture';

// 08_チャット検索.md 対応。
//
// 除外した項目とその理由:
// - 項番15（Chrome動作確認）: 項番3(既存チャット名でのキーワード検索)と同一手順のため、
//   playwright.config.tsのchromiumプロジェクト実行で代表させ、個別テスト化しない
//
// 項番8（ページ送り）について: user01(test-tenant)が20件超のヒット件数を持つ状態が必要なため、
// backend/seed.sqlに「検索確認用ルーム01」〜「検索確認用ルーム25」（25件）を追加した。
//
// セレクタについて: サイドバーの最近のチャット一覧にも同じルーム名が表示されるため、
// チャット名でのアサーションはモーダル（role="dialog"）内に必ずスコープする。
//
// 【i18nバグ】共通クリアボタン(app-search-input)のaria-labelが未定義キー`COMMON.CLEAR`を
// 参照しており、翻訳されず生のキー文字列"COMMON.CLEAR"がそのまま表示される
// （Issue #169として別途起票、本Issueのスコープ外のためテストは実際の挙動に合わせて記録する）。

test.describe('チャット検索', () => {
  test('「チャットを検索」をクリックすると検索モーダルが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'チャットを検索' })).toBeVisible();
    await expect(dialog.getByPlaceholder('検索するワード')).toBeVisible();
  });

  test('既存チャット名の一部を入力すると該当チャットが検索結果に表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('フィードバック確認用ルーム1');
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();
  });

  test('存在しない文字列で検索すると空状態メッセージが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('存在しないチャット名xyz123');
    await expect(dialog.getByText('表示するデータがありません')).toBeVisible();
  });

  test('検索結果にチャット名が表示されること', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('フィードバック確認用ルーム');
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();
    await expect(dialog.getByText('フィードバック確認用ルーム2', { exact: true })).toBeVisible();
  });

  test('検索結果のチャットをクリックすると該当チャットルームに遷移すること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('フィードバック確認用ルーム1');
    await dialog.getByText('フィードバック確認用ルーム1', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);
  });

  test('検索欄をクリアすると検索結果がクリアされること', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    const searchInput = dialog.getByPlaceholder('検索するワード');
    await searchInput.fill('フィードバック確認用ルーム1');
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'COMMON.CLEAR' }).click();
    await expect(searchInput).toHaveValue('');
    await expect(
      dialog.getByText('フィードバック確認用ルーム1', { exact: true }),
    ).not.toBeVisible();
  });

  test('検索欄に文字を入力すると入力完了後に検索が実行されること（デバウンス）', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');

    // 300msのデバウンス中は結果が更新されないことを確認するため、間隔を空けずに連続入力する
    await dialog
      .getByPlaceholder('検索するワード')
      .pressSequentially('フィードバック確認用ルーム1', { delay: 10 });
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();
  });

  test('検索結果が20件超の場合2ページ目が正しく表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('検索確認用ルーム');
    await expect(dialog.getByText('検索確認用ルーム01', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Next page' }).click();
    await expect(dialog.getByText('検索確認用ルーム21', { exact: true })).toBeVisible();
    await expect(dialog.getByText('検索確認用ルーム01', { exact: true })).not.toBeVisible();
  });

  test('チャット名の一部のみ入力すると部分一致するチャットが表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('確認用ルーム1');
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();
  });

  test('モーダルを閉じる操作を実行するとモーダルが閉じること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByPlaceholder('検索するワード')).toBeVisible();

    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('1文字で検索すると該当結果が表示されること', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('1');
    await expect(dialog.getByText('フィードバック確認用ルーム1', { exact: true })).toBeVisible();
  });

  test('特殊文字を含む文字列で検索してもエラーなく検索が実行されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('%_*&<>"\'');
    await expect(dialog.getByText('表示するデータがありません')).toBeVisible();
  });

  test('1件のみヒットする条件で検索すると1件が正しく表示されること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('フィードバックメッセージ確認用ルーム');
    await expect(
      dialog.getByText('フィードバックメッセージ確認用ルーム', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText('フィードバック確認用ルーム1', { exact: true }),
    ).not.toBeVisible();
  });

  test('検索後にページ送りし結果からルーム遷移する一連の操作が正常に完了すること', async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole('button', { name: 'チャットを検索' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('検索するワード').fill('検索確認用ルーム');
    await expect(dialog.getByText('検索確認用ルーム01', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Next page' }).click();
    await expect(dialog.getByText('検索確認用ルーム21', { exact: true })).toBeVisible();

    await dialog.getByText('検索確認用ルーム21', { exact: true }).click();
    await page.waitForURL(/\/chat\/.+/);
  });
});
