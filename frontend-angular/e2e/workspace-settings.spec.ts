import { test, expect, Page } from '@playwright/test';

// 12_ワークスペース設定.md 対応。
//
// 除外した項目とその理由:
// - 項番16（Chrome動作確認）: 項番1(画面表示)と同一手順のため、
//   playwright.config.tsのchromiumプロジェクト実行で代表させ、個別テスト化しない
// - 項番15（API追加→アシスタント→学習データ）: アシスタント作成ダイアログでの接続先反映確認（項番10と
//   同一の`GET /admin/assistants/endpoints/{type}`を参照）をもって代表させ、学習データ画面まで含めた
//   フルチェーンの検証はスコープ外とする（学習データ画面固有のE2Eは別カテゴリで対応する）
//
// このカテゴリは管理者権限が必要なため、authenticatedPage fixture（user01）ではなくadminでログインする。

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('テナントID').fill('test-tenant');
  await page.getByPlaceholder('ユーザーID').fill('admin');
  await page.getByPlaceholder('パスワード').fill('admin@1234');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/dashboard');
}

// ワークスペース名変更ボタン(鉛筆アイコン)はmat-icon(role="img")のみを子に持ち、
// アクセシブルネームがボタン自体には伝播しないため、見出し要素の直後の兄弟要素として取得する
function getRenameButton(page: Page) {
  return page.locator('h2.text-h1').locator('xpath=following-sibling::button[1]');
}

// テナント名・API一覧という共有状態を変更するテストのため、並列実行による競合を避け直列実行する
test.describe.configure({ mode: 'serial' });

test.describe('ワークスペース設定', () => {
  test('ワークスペース設定を開くと設定画面が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant');
    await expect(page.getByText('テスト用テナント', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '利用状況' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'API設定' })).toBeVisible();
  });

  test('「利用状況」タブを選択すると利用プラン・利用合計・履歴が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=usage');
    await expect(page.getByText('利用プラン情報')).toBeVisible();
    await expect(page.getByText('契約中のコース')).toBeVisible();
    await expect(page.getByText('今月の利用合計')).toBeVisible();
  });

  test('「API設定」タブを選択するとAPI一覧が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');
    await expect(page.getByText('設定済みのAPI')).toBeVisible();
    await expect(page.getByText('Local Server (feedbackMessage確認用)')).toBeVisible();
  });

  test('現在のワークスペース名が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant');
    await expect(page.getByText('テスト用テナント', { exact: true })).toBeVisible();
  });

  test('ワークスペース名を変更して保存すると名称が更新されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant');

    await getRenameButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('テスト用テナント（変更後）');
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText('ワークスペース名を更新しました')).toBeVisible();
    await expect(page.getByText('テスト用テナント（変更後）', { exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();

    // 後続テストへの影響を避けるため元の名前に戻す
    await getRenameButton(page).click();
    await dialog.getByRole('textbox').fill('テスト用テナント');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('テスト用テナント', { exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();
  });

  test('API情報を入力して追加するとAPIが一覧に追加されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    await page.getByRole('button', { name: 'APIを追加' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'APIの表示名を入力' }).fill('E2E追加確認用API');
    await dialog
      .getByRole('textbox', { name: '接続先のURLを入力' })
      .fill('http://e2e-test.example');
    await dialog.getByRole('button', { name: '生成' }).click();
    await dialog.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('APIを追加しました')).toBeVisible();
    await expect(page.getByText('E2E追加確認用API', { exact: true })).toBeVisible();
  });

  test('既存APIを編集すると変更が反映されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    // 前のテストで追加した"E2E追加確認用API"を編集対象とする
    const row = page.locator('app-table-list-item').filter({ hasText: 'E2E追加確認用API' });
    await row.getByRole('button').click();
    await page.getByText('APIの設定を編集').click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'APIの表示名を入力' }).fill('E2E編集確認用API');
    // 編集ダイアログはAPIキーを再取得しないため空欄で開く。作成ボタンと同じ必須チェックにより
    // APIキーが空だと保存ボタンが無効化されるため、生成し直す
    await dialog.getByRole('button', { name: '生成' }).click();
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText('E2E編集確認用API', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E追加確認用API', { exact: true })).not.toBeVisible();
  });

  test('既存APIを削除するとAPIが削除されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    const row = page.locator('app-table-list-item').filter({ hasText: 'E2E編集確認用API' });
    await row.getByRole('button').click();
    await page.getByText('APIを削除', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('このAPIを削除してもよろしいですか？この操作は取り消せません。'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText('E2E編集確認用API', { exact: true })).not.toBeVisible();
  });

  test('API追加時に必須項目を空で保存しようとすると作成ボタンが無効化されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    await page.getByRole('button', { name: 'APIを追加' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '作成' })).toBeDisabled();
  });

  test('API追加後、アシスタント管理の接続先選択肢に追加APIが表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    await page.getByRole('button', { name: 'APIを追加' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'APIの表示名を入力' }).fill('E2E連携確認用API');
    await dialog
      .getByRole('textbox', { name: '接続先のURLを入力' })
      .fill('http://e2e-link-test.example');
    await dialog.getByRole('button', { name: '生成' }).click();
    await dialog.getByRole('button', { name: '作成' }).click();
    await expect(page.getByText('APIを追加しました')).toBeVisible();

    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'アシスタントを新規作成' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByText('セキュア', { exact: true }).click();
    await dialog.getByText('APIの接続先を選択').click();
    await expect(dialog.getByRole('option', { name: 'E2E連携確認用API' })).toBeVisible();
  });

  test('最大長のワークスペース名で保存すると正常に保存されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant');

    // backend/app/schemas/tenant.py の tenantName は max_length=32
    const maxLengthName = 'あ'.repeat(32);
    await getRenameButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill(maxLengthName);
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText('ワークスペース名を更新しました')).toBeVisible();
    await expect(page.getByText(maxLengthName, { exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();

    // 後続テストへの影響を避けるため元の名前に戻す
    await getRenameButton(page).click();
    await dialog.getByRole('textbox').fill('テスト用テナント');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('テスト用テナント', { exact: true })).toBeVisible();
    await expect(dialog).not.toBeVisible();
  });

  test('空のワークスペース名で保存しようとするとバリデーションエラーが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant');

    await getRenameButton(page).click();
    const dialog = page.getByRole('dialog');
    const nameInput = dialog.getByRole('textbox');
    await nameInput.fill('テスト用テナント');
    await nameInput.fill('');

    // 空文字では保存ボタン自体が無効化される
    await expect(dialog.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  test('不正なエンドポイントでAPI追加を試行するとエラーメッセージが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    await page.getByRole('button', { name: 'APIを追加' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'APIの表示名を入力' }).fill('E2E不正URL確認用API');
    // backend/app/services/tenant_endpoint_service.py の _assert_valid_url により
    // http(s)://で始まらないURLは400エラーになる
    await dialog
      .getByRole('textbox', { name: '接続先のURLを入力' })
      .fill('invalid-url-without-protocol');
    await dialog.getByRole('button', { name: '生成' }).click();
    await dialog.getByRole('button', { name: '作成' }).click();

    await expect(page.getByText('エンドポイントの作成に失敗しました')).toBeVisible();
  });

  test('使用中APIを削除すると削除されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/tenant?tab=api');

    // 本テスト用に追加したAPIを対象とする（実際にチャット等で使用中のAPIを削除する検証は
    // 他カテゴリのシードデータに影響するため、削除操作そのものが正常に完了することを確認する）
    const row = page.locator('app-table-list-item').filter({ hasText: 'E2E連携確認用API' });
    await row.getByRole('button').click();
    await page.getByText('APIを削除', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText('E2E連携確認用API', { exact: true })).not.toBeVisible();
  });
});
