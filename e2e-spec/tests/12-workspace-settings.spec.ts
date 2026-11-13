import { createEndpoint, deleteEndpoint, deleteEndpointsByPrefix, getTenantName, setTenantName } from '../src/api-workspace.ts';
import { expect, test as base } from '../src/fixtures.ts';
import {
  confirmDialog,
  dialogOf,
  expectErrorToast,
  expectSuccessToast,
} from '../src/pages/admin-widgets.ts';
import { TENANT_NAME_MAX_LENGTH, WORKSPACE_MESSAGES, WorkspacePage } from '../src/pages/workspace.page.ts';

/**
 * 12_ワークスペース設定（16 項目）。項目書: 25DA61_結合テスト項目書_md/12_ワークスペース設定.md
 *
 * 移植元との対応:
 * - ワークスペース名はテナント全体で 1 つなので、名前を変えるテストは直列に流し、終わったら元の名前に戻す
 * - API の追加・編集・削除ができるのは接続先 Local Server のものだけ（項目 6 の備考）
 * - 項番 9「必須未入力」・12「空文字」: 移植元は、必須項目が空の間は「作成」「保存」ボタンを押せない作りで、メッセージは出さない。ボタンが押せないことを確かめる
 * - 項番 10・15: 追加した API が、アシスタント（「接続するAPI」）・学習データ（「接続先エンドポイント」）の選択肢に出ることを画面で確かめる
 * - Chrome の項目（16）は、このテストの実行ブラウザ（Chromium）で主要操作を通す
 */

interface WorkspaceFixtures {
  workspacePage: WorkspacePage;
  /** このテスト専用の接頭辞。画面で追加した API の後片付けにも使う。 */
  prefix: string;
}

const test = base.extend<WorkspaceFixtures>({
  workspacePage: async ({ page }, use) => {
    await use(new WorkspacePage(page));
  },
  prefix: async ({ uniqueId, adminApi }, use) => {
    const prefix = uniqueId('ws');
    await use(prefix);
    await deleteEndpointsByPrefix(adminApi, prefix);
  },
});

const ENDPOINT_URL = 'http://localhost:9090/';
const EDITED_ENDPOINT_URL = 'http://localhost:9091/';

test.describe('12_ワークスペース設定', () => {
  // ワークスペース名はテナントで 1 つしかないので、名前を読む・変えるテストが同時に動かないようにする
  test.describe.configure({ mode: 'serial' });

  let originalName = '';

  test.beforeEach(async ({ adminApi }) => {
    originalName = await getTenantName(adminApi);
  });

  test.afterEach(async ({ adminApi }) => {
    if ((await getTenantName(adminApi)) !== originalName) await setTenantName(adminApi, originalName);
  });

  test('[12-01] 画面表示', async ({ loginAs, workspacePage }) => {
    await loginAs('tenantAdmin');
    await workspacePage.openFromSidebar();
    await expect(workspacePage.tablist.getByText(WORKSPACE_MESSAGES.tabUsage, { exact: true })).toBeVisible();
    await expect(workspacePage.tablist.getByText(WORKSPACE_MESSAGES.tabApi, { exact: true })).toBeVisible();
    await expect(workspacePage.heading).toHaveText(originalName);
  });

  test('[12-02] 利用状況タブ', async ({ loginAs, workspacePage, page }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto();
    await workspacePage.selectTab(WORKSPACE_MESSAGES.tabUsage);
    await expect(page.getByText(WORKSPACE_MESSAGES.planInfo, { exact: true })).toBeVisible();
    await expect(page.getByText(WORKSPACE_MESSAGES.contractPlan, { exact: true })).toBeVisible();
    await expect(page.getByText(WORKSPACE_MESSAGES.periodTotal, { exact: true })).toBeVisible();
    await expect(page.getByText(WORKSPACE_MESSAGES.monthlyHistory, { exact: true })).toBeVisible();
  });

  test('[12-03] API設定タブ', async ({ loginAs, workspacePage, adminApi, prefix, page }) => {
    const endpoint = await createEndpoint(adminApi, `${prefix}-list`, ENDPOINT_URL);
    try {
      await loginAs('tenantAdmin');
      await workspacePage.goto();
      await workspacePage.selectTab(WORKSPACE_MESSAGES.tabApi);
      await expect(page.getByText(WORKSPACE_MESSAGES.configuredApi, { exact: true })).toBeVisible();
      await expect(workspacePage.apiRow(endpoint.endpointName)).toBeVisible();
    } finally {
      await deleteEndpoint(adminApi, endpoint.id);
    }
  });

  test('[12-04] WS名表示', async ({ loginAs, workspacePage }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto();
    await expect(workspacePage.heading).toHaveText(originalName);
  });

  test('[12-05] WS名変更', async ({ loginAs, workspacePage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto();
    const dialog = await workspacePage.openRenameDialog();
    const renamed = `${prefix}`.slice(0, TENANT_NAME_MAX_LENGTH);
    await dialog.getByTestId('tenant-rename-input').fill(renamed);
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.renameSuccess);
    await expect(workspacePage.heading).toHaveText(renamed);
    await page.reload();
    await expect(workspacePage.heading).toHaveText(renamed);
  });

  test('[12-06] API追加', async ({ loginAs, workspacePage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto('?tab=api');
    const dialog = await workspacePage.openAddApiDialog();
    const name = `${prefix}-add`;
    await workspacePage.fillApiDialog(dialog, { name, url: ENDPOINT_URL, generateKey: true });
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.addSuccess);
    await expect(workspacePage.apiRow(name)).toBeVisible();
    await expect(workspacePage.apiRow(name)).toContainText(ENDPOINT_URL);
  });

  test('[12-07] API編集', async ({ loginAs, workspacePage, adminApi, page, prefix }) => {
    const endpoint = await createEndpoint(adminApi, `${prefix}-edit`, ENDPOINT_URL);
    await loginAs('tenantAdmin');
    await workspacePage.goto('?tab=api');
    await workspacePage.rowMenu(endpoint.endpointName, 'tenant-api-edit-button');
    const dialog = dialogOf(page, WORKSPACE_MESSAGES.editApiTitle);
    await expect(dialog).toBeVisible();
    const edited = `${prefix}-edited`;
    // API キーは画面に戻らないため、保存するには「生成」し直す（移植元と同じ）
    await workspacePage.fillApiDialog(dialog, { name: edited, url: EDITED_ENDPOINT_URL, generateKey: true });
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.updateSuccess);
    await expect(workspacePage.apiRow(edited)).toBeVisible();
    await expect(workspacePage.apiRow(edited)).toContainText(EDITED_ENDPOINT_URL);
  });

  test('[12-08] API削除', async ({ loginAs, workspacePage, adminApi, page, prefix }) => {
    const endpoint = await createEndpoint(adminApi, `${prefix}-delete`, ENDPOINT_URL);
    await loginAs('tenantAdmin');
    await workspacePage.goto('?tab=api');
    await workspacePage.rowMenu(endpoint.endpointName, 'tenant-api-delete-button');
    const dialog = dialogOf(page, WORKSPACE_MESSAGES.deleteApiTitle);
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.deleteSuccess);
    await expect(workspacePage.apiRow(endpoint.endpointName)).toHaveCount(0);
  });

  test('[12-09] API必須未入力', async ({ loginAs, workspacePage, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto('?tab=api');
    const dialog = await workspacePage.openAddApiDialog();
    // 何も入れない・一部だけ入れた状態では「作成」を押せない
    await expect(dialog.getByTestId('dialog-confirm-button')).toBeDisabled();
    await workspacePage.fillApiDialog(dialog, { name: `${prefix}-required` });
    await expect(dialog.getByTestId('dialog-confirm-button')).toBeDisabled();
    await workspacePage.fillApiDialog(dialog, { url: ENDPOINT_URL });
    await expect(dialog.getByTestId('dialog-confirm-button')).toBeDisabled();
    await workspacePage.fillApiDialog(dialog, { generateKey: true });
    await expect(dialog.getByTestId('dialog-confirm-button')).toBeEnabled();
  });

  test('[12-10] API追加後連携', async ({ loginAs, adminApi, page, prefix }) => {
    const endpoint = await createEndpoint(adminApi, `${prefix}-link`, ENDPOINT_URL);
    try {
      await loginAs('tenantAdmin');
      await page.goto('/admin/assistants');
      await page.getByRole('button', { name: 'アシスタントを新規作成' }).first().click();
      const dialog = dialogOf(page, 'アシスタントを新規作成');
      // 接続サーバー「セキュア」を選ぶと、接続するAPI の選択肢に Local Server の API が出る
      await dialog.getByText('セキュア', { exact: true }).click();
      const apiSelect = dialog.locator('.app-select').filter({ hasText: 'APIの接続先を選択' }).first();
      await apiSelect.locator('[aria-haspopup="listbox"]').click();
      await expect(apiSelect.getByRole('option', { name: endpoint.endpointName, exact: true })).toBeVisible();
    } finally {
      await deleteEndpoint(adminApi, endpoint.id);
    }
  });

  test('[12-11] WS名最大長', async ({ loginAs, workspacePage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto();
    const dialog = await workspacePage.openRenameDialog();
    const longName = `${prefix}-${'x'.repeat(TENANT_NAME_MAX_LENGTH)}`.slice(0, TENANT_NAME_MAX_LENGTH);
    expect(longName).toHaveLength(TENANT_NAME_MAX_LENGTH);
    await dialog.getByTestId('tenant-rename-input').fill(longName);
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.renameSuccess);
    await expect(workspacePage.heading).toHaveText(longName);
  });

  test('[12-12] WS名空文字', async ({ loginAs, workspacePage }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto();
    const dialog = await workspacePage.openRenameDialog();
    await dialog.getByTestId('tenant-rename-input').fill('');
    // 空のままでは「保存」を押せない（移植元と同じ）
    await expect(dialog.getByTestId('dialog-confirm-button')).toBeDisabled();
    await expect(workspacePage.heading).toHaveText(originalName);
  });

  test('[12-13] API追加失敗', async ({ loginAs, workspacePage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.goto('?tab=api');
    const dialog = await workspacePage.openAddApiDialog();
    // 不正なエンドポイント（URL ではない文字列）。backend が受け付けるかにかかわらず、失敗したときの表示を確かめるため API は失敗させる
    await page.route('**/api/admin/tenants/*/endpoints', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"detail":"invalid endpoint"}' })
        : route.fallback(),
    );
    await workspacePage.fillApiDialog(dialog, { name: `${prefix}-bad`, url: 'invalid-endpoint', generateKey: true });
    await confirmDialog(dialog);
    await expectErrorToast(page, WORKSPACE_MESSAGES.createEndpointFailed);
    // ダイアログは開いたまま（やり直せる）
    await expect(dialog).toBeVisible();
  });

  test('[12-14] API削除後影響', async ({ loginAs, workspacePage, adminApi, page, prefix }) => {
    // 使用中の API: アシスタントに紐づけて削除を試みる
    const endpoint = await createEndpoint(adminApi, `${prefix}-inuse`, ENDPOINT_URL);
    const assistantRes = await adminApi.post('/api/admin/assistants', {
      data: {
        name: `${prefix}-assistant`,
        type: 'SECURE',
        endpoints: [{ id: endpoint.id, model: 'spec-model' }],
      },
    });
    let assistantId: string | undefined;
    if (assistantRes.ok()) assistantId = ((await assistantRes.json()) as { id: string }).id;
    try {
      await loginAs('tenantAdmin');
      await workspacePage.goto('?tab=api');
      await workspacePage.rowMenu(endpoint.endpointName, 'tenant-api-delete-button');
      await confirmDialog(dialogOf(page, WORKSPACE_MESSAGES.deleteApiTitle));
      // 項目書: 「削除されるか警告が表示される」。成功トーストか警告・エラーのどちらかが出て、画面が壊れないこと
      await expect(page.locator('[data-testid^="toast-"]').first()).toBeVisible();
    } finally {
      if (assistantId) await adminApi.delete(`/api/admin/assistants/${assistantId}`);
      await deleteEndpoint(adminApi, endpoint.id);
    }
  });

  test('[12-15] API追加→アシスタント→学習データ', async ({ loginAs, adminApi, page, prefix }) => {
    const endpoint = await createEndpoint(adminApi, `${prefix}-all`, ENDPOINT_URL);
    try {
      await loginAs('tenantAdmin');
      // アシスタント
      await page.goto('/admin/assistants');
      await page.getByRole('button', { name: 'アシスタントを新規作成' }).first().click();
      const assistantDialog = dialogOf(page, 'アシスタントを新規作成');
      await assistantDialog.getByText('セキュア', { exact: true }).click();
      const apiSelect = assistantDialog.locator('.app-select').filter({ hasText: 'APIの接続先を選択' }).first();
      await apiSelect.locator('[aria-haspopup="listbox"]').click();
      await expect(apiSelect.getByRole('option', { name: endpoint.endpointName, exact: true })).toBeVisible();

      // 学習データ（学習先フォルダの新規作成: サーバー「ローカル」で接続先エンドポイントを選ぶ）
      await page.goto('/admin/training-data');
      await page.getByRole('button', { name: '学習先フォルダを新規作成' }).first().click();
      const folderDialog = dialogOf(page, '学習先フォルダを新規作成');
      await folderDialog.getByText('ローカル', { exact: true }).click();
      // 先頭のエンドポイントが自動で選ばれるので、プレースホルダーではなく Select 自体で探す
      const endpointSelect = folderDialog.locator('.app-select').first();
      await chooseOptionVisible(endpointSelect, endpoint.endpointName);
    } finally {
      await deleteEndpoint(adminApi, endpoint.id);
    }
  });

  test('[12-16] WS設定 Chrome', async ({ loginAs, workspacePage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await workspacePage.openFromSidebar();
    await workspacePage.selectTab(WORKSPACE_MESSAGES.tabApi);
    const dialog = await workspacePage.openAddApiDialog();
    const name = `${prefix}-chrome`;
    await workspacePage.fillApiDialog(dialog, { name, url: ENDPOINT_URL, generateKey: true });
    await confirmDialog(dialog);
    await expectSuccessToast(page, WORKSPACE_MESSAGES.addSuccess);
    await expect(workspacePage.apiRow(name)).toBeVisible();
    await workspacePage.rowMenu(name, 'tenant-api-delete-button');
    await confirmDialog(dialogOf(page, WORKSPACE_MESSAGES.deleteApiTitle));
    await expect(workspacePage.apiRow(name)).toHaveCount(0);
  });
});

/**
 * Select を開いて、選択肢が出ていることだけを確かめる（選ばない）。
 *
 * @param select Select のロケーター
 * @param optionLabel 選択肢の文言
 */
async function chooseOptionVisible(select: ReturnType<typeof dialogOf>, optionLabel: string): Promise<void> {
  await select.locator('[aria-haspopup="listbox"]').click();
  await expect(select.getByRole('option', { name: optionLabel, exact: true })).toBeVisible();
}
