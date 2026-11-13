import { deleteUser, getSessionUser } from '../src/api.ts';
import { expect, test as base } from '../src/fixtures.ts';
import {
  confirmDialog,
  dialogOf,
  expectErrorToast,
  expectSuccessToast,
  isSorted,
} from '../src/pages/admin-widgets.ts';
import { USER_MESSAGES, USER_TEXT_MAX_LENGTH, UserAdminPage } from '../src/pages/user-admin.page.ts';
import { TENANT_ID } from '../src/users.ts';

/**
 * 13_ユーザー管理（24 項目）。項目書: 25DA61_結合テスト項目書_md/13_ユーザー管理.md
 *
 * 移植元との対応:
 * - 項番 2「ログインキー列」: 項目書は「******でマスク表示」だが、移植元の最新の画面（NAW-1342 のレビュー指摘で変更）は
 *   キーの値を出さず、設定済み・未設定をアイコンで示す。移植元の現在の画面に合わせて、アイコンの状態と、キーの値が画面に出ていないことを確かめる
 * - 項番 4「必須未入力」: 表示名・ユーザー ID の両方を空にして「作成」を押す
 * - 項番 21・22（ブラウザ違い）: 専用環境のテストは Chromium で流す。Chrome の項目（21）は主要操作を通し、Edge の項目（22）は skip にする
 * - ログインキーでのログインは `/dashboard?loginkey=<キー>&tenantId=<テナント ID>` を開く（03_ログインと同じ）
 * - テストのユーザーは接頭辞つきで作り、検索語にして自分のユーザーだけに絞る（一覧は更新のたびに検索条件が戻るので、作成後は検索し直す）
 */

interface UserAdminFixtures {
  userAdminPage: UserAdminPage;
  /** このテスト専用の接頭辞（ユーザー ID・表示名に使う）。 */
  prefix: string;
  /** 画面で作ったユーザーを、終了時に消す対象として登録する。 */
  trackUser: (loginId: string) => void;
}

const test = base.extend<UserAdminFixtures>({
  userAdminPage: async ({ page }, use) => {
    await use(new UserAdminPage(page));
  },
  // ユーザー ID は 50 文字まで（03-16）。接頭辞は短くする
  prefix: async ({ uniqueId }, use) => {
    await use(uniqueId('um'));
  },
  trackUser: async ({ adminApi }, use) => {
    const loginIds: string[] = [];
    await use((loginId) => loginIds.push(loginId));
    for (const loginId of loginIds) await deleteUser(adminApi, { loginId });
  },
});

test.describe('13_ユーザー管理', () => {
  test('[13-01] 一覧表示', async ({ loginAs, userAdminPage, page }) => {
    await loginAs('tenantAdmin');
    await userAdminPage.openFromSidebar();
    await expect(userAdminPage.rows.first()).toBeVisible();
    for (const header of ['ユーザー表示名', 'ユーザーID', '権限', '請求期間内クレジット', 'ログインキー']) {
      await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
    }
  });

  test('[13-02] ログインキーマスク', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    const withKey = await createUser({ loginId: `${prefix}-key`, issueLoginKey: true });
    const withoutKey = await createUser({ loginId: `${prefix}-nokey` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.rows).toHaveCount(2);
    const keyRow = userAdminPage.row(withKey.loginId);
    await expect(keyRow.getByTestId('admin-users-login-key-status')).toHaveAttribute('data-state', 'set');
    await expect(userAdminPage.row(withoutKey.loginId).getByTestId('admin-users-login-key-status')).toHaveAttribute(
      'data-state',
      'unset',
    );
    // キーの値は一覧に出ない
    await expect(keyRow).not.toContainText(withKey.loginKey ?? 'no-key');
  });

  test('[13-03] 新規作成', async ({ loginAs, userAdminPage, page, prefix, trackUser }) => {
    const loginId = `${prefix}-new`;
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-新規`, userId: loginId });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    // 初期パスワードの表示ダイアログが出る
    await expect(page.getByTestId('admin-users-initial-password-value')).toBeVisible();
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.row(loginId)).toBeVisible();
  });

  test('[13-04] 必須未入力', async ({ loginAs, userAdminPage, page }) => {
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, {});
    await confirmDialog(dialog);
    await expect(dialog.getByText('この項目は必須です')).toHaveCount(2);
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('toast-success')).toHaveCount(0);
  });

  test('[13-05] 重複ID', async ({ loginAs, userAdminPage, createUser, page, prefix }) => {
    const existing = await createUser({ loginId: `${prefix}-dup` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-重複`, userId: existing.loginId });
    await confirmDialog(dialog);
    await expectErrorToast(page, USER_MESSAGES.createFailed);
  });

  test('[13-06] 編集', async ({ loginAs, userAdminPage, createUser, page, prefix }) => {
    const user = await createUser({ loginId: `${prefix}-edit`, name: `${prefix}-before` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await userAdminPage.rowMenu(user.loginId, 'admin-users-edit-button');
    const dialog = dialogOf(page, USER_MESSAGES.editTitle);
    await dialog.getByTestId('admin-users-display-name-input').fill(`${prefix}-after`);
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.updateSuccess);
    await expect(userAdminPage.row(user.loginId)).toContainText(`${prefix}-after`);
  });

  test('[13-07] 削除', async ({ loginAs, userAdminPage, createUser, page, prefix }) => {
    const user = await createUser({ loginId: `${prefix}-del` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await userAdminPage.rowMenu(user.loginId, 'admin-users-delete-button');
    await confirmDialog(dialogOf(page, USER_MESSAGES.deleteTitle));
    await expectSuccessToast(page, USER_MESSAGES.deleteSuccess);
    await expect(userAdminPage.row(user.loginId)).toHaveCount(0);
  });

  test('[13-08] 検索', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    const target = await createUser({ loginId: `${prefix}-target`, name: `${prefix}-対象` });
    await createUser({ loginId: `${prefix}-other`, name: `${prefix}-別` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(`${prefix}-対象`);
    await expect(userAdminPage.rows).toHaveCount(1);
    await expect(userAdminPage.row(target.loginId)).toBeVisible();
  });

  test('[13-09] 権限フィルター', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    const admin = await createUser({ loginId: `${prefix}-adm`, role: 'ADMIN' });
    const general = await createUser({ loginId: `${prefix}-gen`, role: 'USER' });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.rows).toHaveCount(2);
    await userAdminPage.chooseRole(USER_MESSAGES.roleAdmin);
    await expect(userAdminPage.rows).toHaveCount(1);
    await expect(userAdminPage.row(admin.loginId)).toBeVisible();
    await userAdminPage.chooseRole(USER_MESSAGES.roleGeneral);
    await expect(userAdminPage.rows).toHaveCount(1);
    await expect(userAdminPage.row(general.loginId)).toBeVisible();
  });

  test('[13-10] 並べ替え', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    for (const letter of ['c', 'a', 'b']) await createUser({ loginId: `${prefix}-${letter}`, name: `${prefix}-${letter}` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.rows).toHaveCount(3);
    await userAdminPage.chooseSort({ field: USER_MESSAGES.sortName, order: '昇順' });
    await expect.poll(() => userAdminPage.displayNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await userAdminPage.chooseSort({ order: '降順' });
    await expect.poll(() => userAdminPage.displayNames()).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[13-11] 複数選択削除', async ({ loginAs, userAdminPage, createUser, page, prefix }) => {
    const first = await createUser({ loginId: `${prefix}-m1` });
    const second = await createUser({ loginId: `${prefix}-m2` });
    const keep = await createUser({ loginId: `${prefix}-keep` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.rows).toHaveCount(3);
    await userAdminPage.checkbox(userAdminPage.row(first.loginId)).click();
    await userAdminPage.checkbox(userAdminPage.row(second.loginId)).click();
    await page.getByRole('button', { name: USER_MESSAGES.deleteSelected, exact: true }).click();
    await confirmDialog(dialogOf(page, USER_MESSAGES.deleteTitle));
    await expectSuccessToast(page, USER_MESSAGES.deleteSuccess);
    await expect(userAdminPage.rows).toHaveCount(1);
    await expect(userAdminPage.row(keep.loginId)).toBeVisible();
  });

  test('[13-12] ページ送り', async ({ loginAs, userAdminPage, page }) => {
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await expect(userAdminPage.countDisplay).toHaveText(/^1-10 \/ \d+$/);
    const firstPage = await userAdminPage.displayNames();
    await page.getByRole('button', { name: 'Next page' }).first().click();
    await expect(userAdminPage.countDisplay).toHaveText(/^11-\d+ \/ \d+$/);
    await expect.poll(async () => (await userAdminPage.displayNames())[0]).not.toBe(firstPage[0]);
  });

  test('[13-13] 表示名最大長', async ({ loginAs, userAdminPage, page, prefix, trackUser }) => {
    const loginId = `${prefix}-len`;
    trackUser(loginId);
    const displayName = `${prefix}-${'あ'.repeat(USER_TEXT_MAX_LENGTH)}`.slice(0, USER_TEXT_MAX_LENGTH);
    expect(displayName).toHaveLength(USER_TEXT_MAX_LENGTH);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName, userId: loginId });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(loginId);
    await expect(userAdminPage.row(loginId)).toContainText(displayName);
  });

  test('[13-14] ユーザーID最小長', async ({ loginAs, userAdminPage, adminApi, page, trackUser }) => {
    // 1 文字のユーザー ID。ほかのテストが使わない文字（大文字）から選び、前回の残りがあれば消してから作る
    const loginId = String.fromCharCode('A'.charCodeAt(0) + Math.floor(Math.random() * 26));
    await deleteUser(adminApi, { loginId });
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `min-${loginId}`, userId: loginId });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(`min-${loginId}`);
    await expect(userAdminPage.rows.filter({ hasText: `min-${loginId}` })).toHaveCount(1);
  });

  test('[13-15] 権限「一般」', async ({ loginAs, userAdminPage, page, prefix, trackUser }) => {
    const loginId = `${prefix}-gen`;
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-一般`, userId: loginId, role: 'general' });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.row(loginId)).toContainText(USER_MESSAGES.roleGeneral);
  });

  test('[13-16] 権限「管理者」', async ({ loginAs, userAdminPage, page, prefix, trackUser }) => {
    const loginId = `${prefix}-adm`;
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-管理`, userId: loginId, role: 'admin' });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(prefix);
    await expect(userAdminPage.row(loginId)).toContainText(USER_MESSAGES.roleAdmin);
  });

  test('[13-17] 検索＋権限フィルター', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    const target = await createUser({ loginId: `${prefix}-ta`, name: `${prefix}-対象管理`, role: 'ADMIN' });
    await createUser({ loginId: `${prefix}-tu`, name: `${prefix}-対象一般`, role: 'USER' });
    await createUser({ loginId: `${prefix}-oa`, name: `${prefix}-別管理`, role: 'ADMIN' });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(`${prefix}-対象`);
    await userAdminPage.chooseRole(USER_MESSAGES.roleAdmin);
    await expect(userAdminPage.rows).toHaveCount(1);
    await expect(userAdminPage.row(target.loginId)).toBeVisible();
  });

  test('[13-18] 検索＋並べ替え', async ({ loginAs, userAdminPage, createUser, prefix }) => {
    for (const letter of ['b', 'c', 'a']) await createUser({ loginId: `${prefix}-${letter}`, name: `${prefix}-対象${letter}` });
    await createUser({ loginId: `${prefix}-x`, name: `${prefix}-別x` });
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(`${prefix}-対象`);
    await expect(userAdminPage.rows).toHaveCount(3);
    await userAdminPage.chooseSort({ field: USER_MESSAGES.sortName, order: '降順' });
    await expect.poll(() => userAdminPage.displayNames()).toEqual([`${prefix}-対象c`, `${prefix}-対象b`, `${prefix}-対象a`]);
    expect(isSorted(await userAdminPage.displayNames(), 'desc')).toBe(true);
  });

  test('[13-19] 作成APIエラー', async ({ loginAs, userAdminPage, page, prefix }) => {
    await page.route('**/api/admin/users', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
        : route.fallback(),
    );
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-err`, userId: `${prefix}-err` });
    await confirmDialog(dialog);
    await expectErrorToast(page, USER_MESSAGES.createFailed);
  });

  test('[13-20] 削除APIエラー', async ({ loginAs, userAdminPage, createUser, page, prefix }) => {
    const user = await createUser({ loginId: `${prefix}-delerr` });
    await page.route('**/api/admin/users/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
        : route.fallback(),
    );
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await userAdminPage.rowMenu(user.loginId, 'admin-users-delete-button');
    await confirmDialog(dialogOf(page, USER_MESSAGES.deleteTitle));
    await expectErrorToast(page, USER_MESSAGES.deleteFailed);
    await expect(userAdminPage.row(user.loginId)).toBeVisible();
  });

  test('[13-21] ユーザー管理 Chrome', async ({ loginAs, userAdminPage, page, prefix, trackUser }) => {
    const loginId = `${prefix}-cr`;
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.openFromSidebar();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-chrome`, userId: loginId });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    await userAdminPage.closeRevealDialog();
    await userAdminPage.search(prefix);
    await userAdminPage.rowMenu(loginId, 'admin-users-edit-button');
    const edit = dialogOf(page, USER_MESSAGES.editTitle);
    await edit.getByTestId('admin-users-display-name-input').fill(`${prefix}-chrome2`);
    await confirmDialog(edit);
    await expectSuccessToast(page, USER_MESSAGES.updateSuccess);
    await userAdminPage.rowMenu(loginId, 'admin-users-delete-button');
    await confirmDialog(dialogOf(page, USER_MESSAGES.deleteTitle));
    await expect(userAdminPage.row(loginId)).toHaveCount(0);
  });

  test('[13-22] ユーザー管理 Edge', async () => {
    test.skip(true, '専用環境のテストは Chromium（Playwright 同梱）だけで流すため。Edge の実機での確認は目視で行う（Edge のインストールが必要）');
  });

  test('[13-23] 新規作成（ログインキー指定）', async ({ loginAs, userAdminPage, browser, page, prefix, trackUser }) => {
    const loginId = `${prefix}-key`;
    trackUser(loginId);
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    const dialog = await userAdminPage.openCreateDialog();
    await userAdminPage.fillCreateDialog(dialog, { displayName: `${prefix}-キー`, userId: loginId, issueLoginKey: true });
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.createSuccess);
    const loginKey = (await page.getByTestId('admin-users-login-key-value').innerText()).trim();
    expect(loginKey).not.toBe('');
    await userAdminPage.closeRevealDialog();

    // 作ったキーでログインできる（別のブラウザセッション）
    const context = await browser.newContext();
    try {
      const keyPage = await context.newPage();
      await keyPage.goto(`/dashboard?loginkey=${loginKey}&tenantId=${TENANT_ID}`);
      await expect(keyPage.locator('aside').first()).toBeVisible();
      await expect.poll(async () => (await getSessionUser(keyPage.request))?.id).toBe(loginId);
    } finally {
      await context.close();
    }
  });

  test('[13-24] 編集（ログインキー変更）', async ({ loginAs, userAdminPage, createUser, browser, page, prefix }) => {
    const user = await createUser({ loginId: `${prefix}-rekey`, issueLoginKey: true });
    const oldKey = user.loginKey ?? '';
    expect(oldKey).not.toBe('');
    await loginAs('tenantAdmin');
    await userAdminPage.goto();
    await userAdminPage.search(prefix);
    await userAdminPage.rowMenu(user.loginId, 'admin-users-edit-button');
    const dialog = dialogOf(page, USER_MESSAGES.editTitle);
    // ラジオの入力欄自体は隠れているので、ラベルの文言を押す
    await dialog.getByText(USER_MESSAGES.reissue, { exact: true }).click();
    await confirmDialog(dialog);
    await expectSuccessToast(page, USER_MESSAGES.updateSuccess);
    const newKey = (await page.getByTestId('admin-users-login-key-value').innerText()).trim();
    expect(newKey).not.toBe('');
    expect(newKey).not.toBe(oldKey);
    await userAdminPage.closeRevealDialog();

    const context = await browser.newContext();
    try {
      const keyPage = await context.newPage();
      await keyPage.goto(`/dashboard?loginkey=${newKey}&tenantId=${TENANT_ID}`);
      await expect(keyPage.locator('aside').first()).toBeVisible();
      await expect.poll(async () => (await getSessionUser(keyPage.request))?.id).toBe(user.loginId);
    } finally {
      await context.close();
    }
    // 古いキーではログインできない
    const oldContext = await browser.newContext();
    try {
      const oldPage = await oldContext.newPage();
      await oldPage.goto(`/dashboard?loginkey=${oldKey}&tenantId=${TENANT_ID}`);
      await expect(oldPage).toHaveURL(/\/auth\/login/);
      expect(await getSessionUser(oldPage.request)).toBeNull();
    } finally {
      await oldContext.close();
    }
  });
});
