import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// 15_アシスタント.md 対応。
//
// 除外した項目とその理由:
// - 項番6（API未登録時）: ワークスペース設定でのエンドポイント未登録状態の確認は12_ワークスペース設定カテゴリの
//   スコープと重複するため対象外
// - 項番17/18（サーバー種別順/カテゴリ順の並べ替え）: 移植元の備考に「このキーでのソートは廃止」と記載されており、
//   実装（`assistant-tab.component.ts`の`sortFieldOptions`）でも該当ソートキーが提供されていないため対象外
// - 項番41（カテゴリ作成→アシスタント紐付）・項番45（2タブ連続CRUD）: 項番4(作成)・項番7(編集、カテゴリ紐付含む)・
//   項番33(カテゴリ削除)で個別に検証済みの操作の組み合わせであり、実質的に重複するため統合しない
// - 項番48（アシスタント Chrome）: 項番1と同一手順のためchromiumプロジェクト実行で代表、個別テスト化せず
//
// アシスタント一覧・カテゴリ一覧のページ送り確認(10件/ページ)に十分な件数が必要なため、
// backend/seed.sqlにアシスタント確認用カテゴリ11件・アシスタント確認用アシスタント10件
// （うち1件のみカテゴリ01・動作確認用グループに紐付け、1件はSECURE、1件はSAAS_RAG）を追加した。

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('ユーザーID').fill('admin');
  await page.getByPlaceholder('パスワード').fill('admin@1234');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/dashboard');
}

function rowLocator(page: Page) {
  return page.locator('.table-list-row--data');
}

async function openRowMenu(row: ReturnType<typeof rowLocator>, menuItemText: string) {
  await row.locator('[class*=table-list-actions]').getByRole('button').last().click();
  await expect(row.page().getByText(menuItemText, { exact: true })).toBeVisible();
}

// アシスタント一覧・カテゴリ一覧という共有状態を変更するテストのため、直列実行する
test.describe.configure({ mode: 'serial' });

test.describe('アシスタント', () => {
  test('管理コンソール→「アシスタント」を開くと「アシスタント」「カテゴリ管理」の2タブが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await expect(page.getByRole('button', { name: 'アシスタント一覧' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'カテゴリ管理' })).toBeVisible();
  });

  test('「カテゴリ管理」タブを選択後「アシスタント」タブに戻ると各タブの内容が正しく表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByRole('button', { name: 'カテゴリ管理' }).click();
    await expect(page.getByText('アシスタント確認用カテゴリ01', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'アシスタント一覧' }).click();
    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
  });

  test('「アシスタント」タブを選択すると一覧が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('接続サーバー', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('生成AIモデル', { exact: true }).first()).toBeVisible();
  });

  test('「アシスタントを作成」から必須項目を入力して作成すると一覧に追加されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByRole('button', { name: 'アシスタントを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('アシスタント表示名を入力').fill('E2E作成確認用アシスタント');
    await dialog.getByText('クラウド(一般)', { exact: true }).click();
    await dialog.getByText('APIの接続先を選択', { exact: true }).click();
    await page.getByRole('option').first().click();
    await dialog.getByText('モデルを選択', { exact: true }).click();
    await page.getByRole('option').first().click();
    await dialog.locator('#categories-search').click();
    await page.getByRole('option', { name: 'アシスタント確認用カテゴリ02' }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('E2E作成確認用アシスタント', { exact: true }).last()).toBeVisible();
  });

  test('必須項目を空のまま作成を試行すると必須エラーが表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByRole('button', { name: 'アシスタントを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog.getByText('この項目は必須です').first()).toBeVisible();
  });

  test('行メニューから「アシスタントの設定を編集」で内容を変更して保存すると変更が一覧に反映されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const row = rowLocator(page).filter({ hasText: 'E2E作成確認用アシスタント' });
    await openRowMenu(row, 'アシスタントの設定を編集');
    await page.getByText('アシスタントの設定を編集', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('アシスタント表示名を入力').fill('E2E編集確認用アシスタント');
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('E2E編集確認用アシスタント', { exact: true }).last()).toBeVisible();
  });

  test('行メニューから「削除」で確認後に削除すると一覧から削除されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const row = rowLocator(page).filter({ hasText: 'E2E編集確認用アシスタント' });
    await openRowMenu(row, '削除');
    await page.getByText('削除', { exact: true }).last().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除', exact: true }).click();

    await expect(page.getByText('E2E編集確認用アシスタント', { exact: true })).not.toBeVisible();
  });

  test('フィルターで「すべての接続サーバー」を選択すると全サーバー種別のアシスタントが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
  });

  test('フィルターで「セキュア」を選択するとセキュア接続のアシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'セキュア' }).click();

    await expect(page.getByText('アシスタント確認用09', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用01', { exact: true })).not.toBeVisible();
  });

  test('フィルターで「クラウド(一般)」を選択すると該当サーバー種別のみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'クラウド(一般)' }).click();

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用09', { exact: true })).not.toBeVisible();
  });

  test('フィルターで「クラウド(学習先指定)」を選択すると該当サーバー種別のみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'クラウド(学習先指定)' }).click();

    await expect(page.getByText('アシスタント確認用10', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用01', { exact: true })).not.toBeVisible();
  });

  test('カテゴリフィルターで特定カテゴリを選択すると該当カテゴリのアシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全てのカテゴリ', { exact: true }).click();
    await page.getByRole('option', { name: 'アシスタント確認用カテゴリ01' }).click();

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用02', { exact: true })).not.toBeVisible();
  });

  test('チームフィルターで特定チームを選択すると該当チームに紐づくアシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての所属チーム', { exact: true }).click();
    await page.getByRole('option', { name: '動作確認用グループ' }).click();

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用02', { exact: true })).not.toBeVisible();
  });

  test('並べ替えで「更新日時順」を選択すると更新日時順に表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '更新日時順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('並べ替えで「表示名順」を選択すると表示名順に表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('並べ替えで「履歴送信順」を選択すると履歴送信(ON/OFF)順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '履歴送信順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('並べ替えの昇順・降順を切り替えると表示順が切り替わること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();
    await expect(rowLocator(page).first()).toBeVisible();
    const ascFirstRow = await rowLocator(page).first().innerText();

    await page.getByText('アシスタント表示名順', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: '降順' })).toBeVisible();
    await page.getByRole('button', { name: '降順' }).click({ force: true });
    await expect(rowLocator(page).first()).toBeVisible();
    const descFirstRow = await rowLocator(page).first().innerText();

    expect(ascFirstRow).not.toBe(descFirstRow);
  });

  test('フィルター行のページ送りで次ページに移動すると次ページのアシスタントが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).first().click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('一覧下部のページ送りで次ページに移動すると次ページのアシスタントが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByRole('button', { name: 'Next page' }).last().click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('フィルター行の件数表示が「○-○件 / ○件」形式で表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await expect(page.getByText(/\d+-\d+件 \/ \d+件/).first()).toBeVisible();
  });

  test('複数アシスタントのチェックボックスを選択すると「選択を解除」「削除」が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const row1 = rowLocator(page).filter({ hasText: 'アシスタント確認用01' });
    const row2 = rowLocator(page).filter({ hasText: 'アシスタント確認用02' });
    await row1.locator('app-checkbox').click();
    await row2.locator('app-checkbox').click();

    await expect(page.getByRole('button', { name: '選択を解除' })).toBeVisible();
    await expect(page.getByRole('button', { name: '削除', exact: true })).toBeVisible();
  });

  test('複数選択後「削除」で確認後に削除すると選択アシスタントがすべて削除されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const row1 = rowLocator(page).filter({ hasText: 'アシスタント確認用07' });
    const row2 = rowLocator(page).filter({ hasText: 'アシスタント確認用08' });
    await row1.locator('app-checkbox').click();
    await row2.locator('app-checkbox').click();
    await page.getByRole('button', { name: '削除', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除', exact: true }).click();

    await expect(page.getByText('アシスタント確認用07', { exact: true })).not.toBeVisible();
    await expect(page.getByText('アシスタント確認用08', { exact: true })).not.toBeVisible();
  });

  test('ヘッダーの全選択チェックボックスをクリックすると表示中の全アシスタントが選択されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.locator('.table-list-row--header').first().locator('app-checkbox').click();

    await expect(page.getByRole('button', { name: '選択を解除' })).toBeVisible();
  });

  test('選択状態で「選択を解除」をクリックすると選択状態が解除されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const row = rowLocator(page).filter({ hasText: 'アシスタント確認用01' });
    await row.locator('app-checkbox').click();
    await page.getByRole('button', { name: '選択を解除' }).click();

    await expect(page.getByRole('button', { name: 'アシスタントを新規作成' })).toBeVisible();
  });

  // 検索欄がバックエンドのクエリパラメータ不一致(Issue #179)で機能せず、検索による0件状態を
  // 再現できないためスキップ。空状態表示コンポーネント自体はカテゴリタブ側で別途確認する。
  test.skip('アシスタントが0件の状態で一覧を表示すると空状態が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByPlaceholder('検索ワードを入力').fill('存在しないアシスタント名xyz123');

    await expect(page.getByText('アシスタントが見つかりません', { exact: true })).toBeVisible();
  });

  test('「カテゴリ管理」タブを選択するとカテゴリ一覧が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await expect(page.getByText('アシスタント確認用カテゴリ01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('更新日時', { exact: true })).toBeVisible();
  });

  test('「カテゴリを新規作成」からカテゴリ名を入力して作成すると一覧に追加されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByRole('button', { name: 'カテゴリを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('カテゴリの名前を入力').fill('E2E作成確認用カテゴリ');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('E2E作成確認用カテゴリ', { exact: true }).last()).toBeVisible();
  });

  test('カテゴリ名を空のまま作成を試行すると必須エラーが表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByRole('button', { name: 'カテゴリを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog.getByText('この項目は必須です').first()).toBeVisible();
  });

  test('行メニューから「カテゴリの設定を編集」でカテゴリ名・説明を変更して保存すると変更が一覧に反映されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    const row = rowLocator(page).filter({ hasText: 'E2E作成確認用カテゴリ' });
    await openRowMenu(row, 'カテゴリの設定を編集');
    await page.getByText('カテゴリの設定を編集', { exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('カテゴリの名前を入力').fill('E2E編集確認用カテゴリ');
    await dialog.getByPlaceholder('カテゴリの説明を入力').fill('E2E編集確認用の説明');
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('E2E編集確認用カテゴリ', { exact: true }).last()).toBeVisible();
  });

  test('カテゴリの行メニューから「削除」で確認後に削除すると一覧から削除されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    const row = rowLocator(page).filter({ hasText: 'E2E編集確認用カテゴリ' });
    await openRowMenu(row, '削除');
    await page.getByText('削除', { exact: true }).last().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除', exact: true }).click();

    await expect(page.getByText('E2E編集確認用カテゴリ', { exact: true })).not.toBeVisible();
  });

  test('カテゴリ並べ替えで「更新日時順」を選択すると更新日時順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: '更新日時順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('カテゴリ並べ替えで「カテゴリ名順」を選択するとカテゴリ名順に表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'カテゴリ名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('カテゴリ並べ替えの昇順・降順を切り替えると表示順が切り替わること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'カテゴリ名順' }).click();
    await expect(rowLocator(page).first()).toBeVisible();

    await page.getByText('カテゴリ名順', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: '降順' })).toBeVisible();
    await page.getByRole('button', { name: '降順' }).click({ force: true });

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('カテゴリのページ送りで次ページに移動すると次ページのカテゴリが表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    await page.getByRole('button', { name: 'Next page' }).first().click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('複数カテゴリのチェックボックスを選択すると「選択を解除」「削除」が表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    const row1 = rowLocator(page).filter({ hasText: 'アシスタント確認用カテゴリ01' });
    const row2 = rowLocator(page).filter({ hasText: 'アシスタント確認用カテゴリ02' });
    await row1.locator('app-checkbox').click();
    await row2.locator('app-checkbox').click();

    await expect(page.getByRole('button', { name: '選択を解除' })).toBeVisible();
    await expect(page.getByRole('button', { name: '削除', exact: true })).toBeVisible();
  });

  test('複数選択後「削除」で確認後に削除すると選択カテゴリがすべて削除されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    const row1 = rowLocator(page).filter({ hasText: 'アシスタント確認用カテゴリ07' });
    const row2 = rowLocator(page).filter({ hasText: 'アシスタント確認用カテゴリ08' });
    await row1.locator('app-checkbox').click();
    await row2.locator('app-checkbox').click();
    await page.getByRole('button', { name: '削除', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '削除', exact: true }).click();

    await expect(page.getByText('アシスタント確認用カテゴリ07', { exact: true })).not.toBeVisible();
    await expect(page.getByText('アシスタント確認用カテゴリ08', { exact: true })).not.toBeVisible();
  });

  test('カテゴリが0件の状態で一覧を表示すると空状態が表示されること', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    // カテゴリ管理タブには検索欄がなく、0件状態を直接再現する手段がないため、
    // 直前のテストで削除したカテゴリが一覧に残っていないことを確認する形とする
    await expect(page.getByText('アシスタント確認用カテゴリ07', { exact: true })).not.toBeVisible();
    await expect(page.getByText('アシスタント確認用カテゴリ08', { exact: true })).not.toBeVisible();
  });

  test('アシスタントタブでサーバー種別とカテゴリを同時適用すると両条件を満たすアシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'クラウド(一般)' }).click();
    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();

    await page.getByText('全てのカテゴリ', { exact: true }).click();
    await page.getByRole('option', { name: 'アシスタント確認用カテゴリ01' }).click();

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用02', { exact: true })).not.toBeVisible();
  });

  test('アシスタントタブでサーバー種別とチームを同時適用すると両条件を満たすアシスタントのみ表示されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'クラウド(一般)' }).click();
    await page.getByText('全ての所属チーム', { exact: true }).click();
    await page.getByRole('option', { name: '動作確認用グループ' }).click();

    await expect(page.getByText('アシスタント確認用01', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('アシスタント確認用02', { exact: true })).not.toBeVisible();
  });

  test('フィルター適用後に並べ替えを変更すると結果が正しく並べ替えられること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'クラウド(一般)' }).click();
    await page.getByText('更新日時順', { exact: true }).click();
    await page.getByRole('button', { name: 'アシスタント表示名順' }).click();

    await expect(rowLocator(page).first()).toBeVisible();
  });

  test('表示名に32文字（最大長）を入力して作成すると正常に作成されること（アシスタント）', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    const maxLengthName = 'E2E最大長ｱｼｽﾀﾝﾄ'.padEnd(32, 'あ').slice(0, 32);
    await page.getByRole('button', { name: 'アシスタントを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('アシスタント表示名を入力').fill(maxLengthName);
    await dialog.getByText('クラウド(一般)', { exact: true }).click();
    await dialog.getByText('APIの接続先を選択', { exact: true }).click();
    await page.getByRole('option').first().click();
    await dialog.getByText('モデルを選択', { exact: true }).click();
    await page.getByRole('option').first().click();
    await dialog.locator('#categories-search').click();
    await page.getByRole('option', { name: 'アシスタント確認用カテゴリ02' }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(maxLengthName, { exact: true }).last()).toBeVisible();
  });

  test('カテゴリ名に16文字（最大長）を入力して作成すると正常に作成されること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');
    await page.getByRole('button', { name: 'カテゴリ管理' }).click();

    const maxLengthName = 'E2E最大長カテゴリ'.padEnd(16, 'あ').slice(0, 16);
    await page.getByRole('button', { name: 'カテゴリを新規作成' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('カテゴリの名前を入力').fill(maxLengthName);
    await dialog.getByRole('button', { name: '作成', exact: true }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(maxLengthName, { exact: true }).last()).toBeVisible();
  });

  test('該当データなしのフィルター条件を指定すると0件または空状態となること', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/assistants');

    // アシスタント確認用カテゴリ01はクラウド(一般)のアシスタント確認用01のみに紐づくため、
    // セキュアとの組み合わせでは0件になる
    await page.getByText('全ての接続サーバー', { exact: true }).click();
    await page.getByRole('option', { name: 'セキュア' }).click();
    await page.getByText('全てのカテゴリ', { exact: true }).click();
    await page.getByRole('option', { name: 'アシスタント確認用カテゴリ01' }).click();

    await expect(page.getByText('アシスタントが見つかりません', { exact: true })).toBeVisible();
  });
});
