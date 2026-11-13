import type { Page } from '@playwright/test';
import { DEFAULT_NEW_PASSWORD } from '../src/api.ts';
import { expect, test } from '../src/fixtures.ts';
import { DASHBOARD_PATH, LOGIN_PATH } from '../src/pages/login.page.ts';
import { PasswordResetPage, PW_RESET_MESSAGES, PW_RESET_PATH } from '../src/pages/password-reset.page.ts';
import { SidebarPage } from '../src/pages/sidebar.page.ts';
import type { LoginPage } from '../src/pages/login.page.ts';
import { createPolicyTenant, deletePolicyTenant, type PolicyTenant } from '../src/pw-tenant.ts';

/**
 * 05_パスワード再設定（38 項目）。項目書: 25DA61_結合テスト項目書_md/05_パスワード再設定.md
 *
 * 移植元との対応:
 * - パスワード設定画面へは、ログイン後にユーザーメニューから進む。初期パスワードのユーザーはログインすると自動でこの画面へ進む
 * - 移植元ではログインID欄は編集できない（disabled。ログイン中のユーザーのIDが入る）。「ログインID未入力」「存在しないログインID」は、
 *   画面を直接開く（入力されていない）・URL の `?username=` で別の ID を渡す、ことで再現する
 * - 項番 16〜18 と 23〜38 はテナントのパスワードポリシーを変えるため、テストごとに専用のテナントを SQL で作る（src/pw-tenant.ts）。
 *   最小文字数は項目書の 8 文字にそろえる（test-tenant は 12 文字）
 * - 項番 4 の Chrome は Playwright の Chromium（Chrome と同じエンジン）
 */

const RESET_URL = new RegExp(PW_RESET_PATH);
const LOGIN_URL = new RegExp(LOGIN_PATH);
const DASHBOARD_URL = new RegExp(DASHBOARD_PATH);
/** ポリシー専用テナントの最小文字数（項目書の「8文字（最小許可長）」）。 */
const POLICY_MIN_LENGTH = 8;
/** パスワードの最大文字数（移植元 PASSWORD_MAX_LENGTH）。 */
const PASSWORD_MAX_LENGTH = 64;
/** 試行回数の上限まで繰り返す最大回数（移植元の失敗上限は 6 回。余裕を持たせる）。 */
const MAX_ATTEMPTS = 10;
const WRONG_PASSWORD = 'Wrong@1234Ab';

/** 新しいパスワード（DEFAULT_NEW_PASSWORD とは別の、test-tenant のポリシー（12 文字以上・大小英字・数字・記号）を満たす値）。 */
const NEW_PASSWORD = 'Brand@New5678Cd';

/** ログイン中のユーザーとして、ユーザーメニューからパスワード設定画面を開く。 */
async function openFromUserMenu(page: Page): Promise<PasswordResetPage> {
  await new SidebarPage(page).selectUserMenu('password');
  const resetPage = new PasswordResetPage(page);
  await expect(page).toHaveURL(RESET_URL);
  await resetPage.expectLoaded();
  return resetPage;
}

/** 欄の下のエラー文言が、指定の文言を 1 つ含む。 */
async function expectFieldError(resetPage: PasswordResetPage, field: Parameters<PasswordResetPage['group']>[0], text: string) {
  await expect(resetPage.group(field).getByText(text)).toBeVisible();
}

/** ポリシー専用テナントのユーザーでログインし、自動で進むパスワード設定画面（初期パスワード）を開く。 */
async function loginToResetPage(page: Page, loginPage: LoginPage, tenant: PolicyTenant): Promise<PasswordResetPage> {
  await loginPage.goto();
  await loginPage.fill({ tenantId: tenant.tenantId, loginId: tenant.loginId, password: tenant.password });
  await loginPage.submit();
  await expect(page).toHaveURL(RESET_URL);
  const resetPage = new PasswordResetPage(page);
  await resetPage.expectLoaded();
  return resetPage;
}

test.describe('05_パスワード再設定', () => {
  test('[05-01] 画面表示（直接アクセス）', async ({ page }) => {
    await page.goto(PW_RESET_PATH);
    const resetPage = new PasswordResetPage(page);
    await resetPage.expectLoaded();
    for (const field of ['username', 'oldPassword', 'newPassword', 'confirmPassword'] as const) {
      await expect(resetPage.input(field), field).toBeVisible();
    }
    await expect(page.getByText('ログインID', { exact: true })).toBeVisible();
    await expect(page.getByText('旧パスワード', { exact: true })).toBeVisible();
    await expect(page.getByText('新パスワード', { exact: true })).toBeVisible();
    await expect(page.getByText('新パスワード（再入力）', { exact: true })).toBeVisible();
  });

  test('[05-02] 画面表示（ユーザーメニュー）', async ({ loginAs, page }) => {
    const user = await loginAs('user');
    const resetPage = await openFromUserMenu(page);
    // ログイン中のユーザーのIDが入っている
    await expect(resetPage.input('username')).toHaveValue(user.loginId);
  });

  test('[05-03] 正常更新', async ({ loginPage, page, createUser }) => {
    const user = await createUser({});
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: user.password, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    const response = await resetPage.submitAndWaitForApi();
    expect(response.ok()).toBe(true);
    // 「パスワードを更新しました。」が表示され、認証後画面（ダッシュボード）に遷移する
    await expect(page.getByText(PW_RESET_MESSAGES.success)).toBeVisible();
    await expect(page).toHaveURL(DASHBOARD_URL);
  });

  test('[05-04] 正常更新 Chrome', async ({ loginPage, page, createUser, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    const user = await createUser({});
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: user.password, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    const response = await resetPage.submitAndWaitForApi();
    expect(response.ok()).toBe(true);
    await expect(page.getByText(PW_RESET_MESSAGES.success)).toBeVisible();
    await expect(page).toHaveURL(DASHBOARD_URL);
  });

  test('[05-05] ログインID未入力', async ({ page }) => {
    // 画面を直接開くとログインIDは空。ログインID以外を入力して更新を押す
    await page.goto(PW_RESET_PATH);
    const resetPage = new PasswordResetPage(page);
    await resetPage.expectLoaded();
    await resetPage.fill({ oldPassword: 'Old@Pass1234', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    await resetPage.submit();
    await expectFieldError(resetPage, 'username', PW_RESET_MESSAGES.required);
  });

  test('[05-06] 旧パスワード未入力', async ({ loginAs, page }) => {
    await loginAs('user');
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    await resetPage.submit();
    await expectFieldError(resetPage, 'oldPassword', PW_RESET_MESSAGES.required);
  });

  test('[05-07] 新パスワード未入力', async ({ loginAs, page }) => {
    await loginAs('user');
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: 'Old@Pass1234' });
    await resetPage.submit();
    await expectFieldError(resetPage, 'newPassword', PW_RESET_MESSAGES.required);
  });

  test('[05-08] 再入力未入力', async ({ loginAs, page }) => {
    await loginAs('user');
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: 'Old@Pass1234', newPassword: NEW_PASSWORD });
    await resetPage.submit();
    // 項目書の備考: 実際の表示は「パスワードが一致しません」（移植元は不一致を必須より優先して出す）
    await expectFieldError(resetPage, 'confirmPassword', PW_RESET_MESSAGES.mismatch);
  });

  test('[05-09] 全項目未入力', async ({ page }) => {
    await page.goto(PW_RESET_PATH);
    const resetPage = new PasswordResetPage(page);
    await resetPage.expectLoaded();
    await resetPage.submit();
    // 各必須項目に「この項目は必須です」。ログインIDは移植元では編集できない欄のため、パスワード 3 欄で確かめる
    for (const field of ['oldPassword', 'newPassword', 'confirmPassword'] as const) {
      await expectFieldError(resetPage, field, PW_RESET_MESSAGES.required);
    }
  });

  test('[05-10] 新パスワード不一致', async ({ loginAs, page }) => {
    await loginAs('user');
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: 'Old@Pass1234', newPassword: NEW_PASSWORD, confirmPassword: `${NEW_PASSWORD}x` });
    await resetPage.submit();
    await expect(page.getByText(PW_RESET_MESSAGES.mismatch)).toBeVisible();
    await expect(page).toHaveURL(RESET_URL);
  });

  for (const [number, field, label] of [
    ['11', 'oldPassword', '旧パスワード'],
    ['12', 'newPassword', '新パスワード'],
    ['13', 'confirmPassword', '再入力'],
  ] as const) {
    test(`[05-${number}] ${label}表示切替`, async ({ page }) => {
      await page.goto(PW_RESET_PATH);
      const resetPage = new PasswordResetPage(page);
      await resetPage.expectLoaded();
      await resetPage.input(field).fill('Secret@1234');
      await expect(resetPage.input(field)).toHaveAttribute('type', 'password');
      await resetPage.toggle(field).click();
      await expect(resetPage.input(field)).toHaveAttribute('type', 'text');
      await expect(resetPage.input(field)).toHaveValue('Secret@1234');
      await resetPage.toggle(field).click();
      await expect(resetPage.input(field)).toHaveAttribute('type', 'password');
    });
  }

  test('[05-14] フッターリンク表示', async ({ page }) => {
    await page.goto(PW_RESET_PATH);
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: '利用規約' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'ユニリタ' })).toBeVisible();
  });

  test('[05-15] 更新後再ログイン', async ({ loginPage, page, createUser }) => {
    const user = await createUser({});
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: user.password, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    const response = await resetPage.submitAndWaitForApi();
    expect(response.ok()).toBe(true);
    await expect(page).toHaveURL(DASHBOARD_URL);
    // 一度ログアウトし、新パスワードでログインする
    const sidebar = new SidebarPage(page);
    await sidebar.logout();
    await expect(page).toHaveURL(LOGIN_URL);
    await loginPage.login({ ...user, password: NEW_PASSWORD });
    await sidebar.expectLayout();
  });

  test('[05-16] 新パスワード最小文字数', async ({ loginPage, page }) => {
    const tenant = createPolicyTenant({ minLength: POLICY_MIN_LENGTH, uppercase: true, lowercase: true, digits: true, symbols: true });
    try {
      const resetPage = await loginToResetPage(page, loginPage, tenant);
      const eightChars = 'Aa1!bcde';
      expect(eightChars).toHaveLength(POLICY_MIN_LENGTH);
      await resetPage.fill({ newPassword: eightChars, confirmPassword: eightChars });
      const response = await resetPage.submitAndWaitForApi();
      // バリデーションを通過し、更新処理が実行される
      expect(response.ok()).toBe(true);
      await expect(page).toHaveURL(DASHBOARD_URL);
    } finally {
      deletePolicyTenant(tenant);
    }
  });

  test('[05-17] 新パスワード文字数不足', async ({ loginPage, page }) => {
    const tenant = createPolicyTenant({ minLength: POLICY_MIN_LENGTH, uppercase: true, lowercase: true, digits: true, symbols: true });
    try {
      const resetPage = await loginToResetPage(page, loginPage, tenant);
      const sevenChars = 'Aa1!bcd';
      expect(sevenChars).toHaveLength(POLICY_MIN_LENGTH - 1);
      await resetPage.fill({ newPassword: sevenChars, confirmPassword: sevenChars });
      const response = await resetPage.submitAndWaitForApi();
      expect(response.ok()).toBe(false);
      // バリデーションエラーが表示され、更新されない
      await expect(page.getByText(`${POLICY_MIN_LENGTH}文字以上`)).toBeVisible();
      await expect(page).toHaveURL(RESET_URL);
    } finally {
      deletePolicyTenant(tenant);
    }
  });

  test('[05-18] 新パスワード最大文字数', async ({ loginPage, page }) => {
    const tenant = createPolicyTenant({ minLength: POLICY_MIN_LENGTH, uppercase: true, lowercase: true, digits: true, symbols: true });
    try {
      const resetPage = await loginToResetPage(page, loginPage, tenant);
      const maxChars = `Aa1!${'b'.repeat(PASSWORD_MAX_LENGTH - 4)}`;
      expect(maxChars).toHaveLength(PASSWORD_MAX_LENGTH);
      await resetPage.fill({ newPassword: maxChars, confirmPassword: maxChars });
      // 入力欄は 64 文字までしか入らない。64 文字がそのまま入っている
      await expect(resetPage.input('newPassword')).toHaveValue(maxChars);
      const response = await resetPage.submitAndWaitForApi();
      expect(response.ok()).toBe(true);
      await expect(page).toHaveURL(DASHBOARD_URL);
    } finally {
      deletePolicyTenant(tenant);
    }
  });

  test('[05-19] 旧パスワード誤り', async ({ loginPage, page, createUser }) => {
    const user = await createUser({});
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    const response = await resetPage.submitAndWaitForApi();
    expect(response.ok()).toBe(false);
    // バックエンドから返されたエラーメッセージが表示され、更新されない
    const body = (await response.json()) as { message?: string; detail?: string };
    const message = body.message ?? body.detail ?? '';
    expect(message).not.toBe('');
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page).toHaveURL(RESET_URL);
  });

  test('[05-20] 存在しないログインID', async ({ loginAs, page, uniqueId }) => {
    await loginAs('user');
    // ログインID欄は移植元では編集できないため、URL で存在しない ID を渡す
    await page.goto(`${PW_RESET_PATH}?username=${uniqueId('nobody')}`);
    const resetPage = new PasswordResetPage(page);
    await resetPage.expectLoaded();
    await resetPage.fill({ oldPassword: 'Old@Pass1234', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    const response = await resetPage.submitAndWaitForApi();
    expect(response.ok()).toBe(false);
    const body = (await response.json()) as { message?: string; detail?: string };
    const message = body.message ?? body.detail ?? '';
    expect(message).not.toBe('');
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page).toHaveURL(RESET_URL);
  });

  test('[05-21] 新旧パスワード同一', async ({ loginPage, page, createUser }) => {
    const user = await createUser({ password: DEFAULT_NEW_PASSWORD });
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: user.password, newPassword: user.password, confirmPassword: user.password });
    const response = await resetPage.submitAndWaitForApi();
    // エラーメッセージが表示されるか、更新が拒否される（メッセージの表示は 05-17・05-19 で確かめる）
    expect(response.ok()).toBe(false);
    await expect(page).toHaveURL(RESET_URL);
  });

  test('[05-22] 試行回数上限', async ({ loginPage, page, createUser }) => {
    // 失敗回数はユーザーごとに数え、ロックされる。このテスト専用のユーザーを使う
    const user = await createUser({});
    await loginPage.login(user);
    const resetPage = await openFromUserMenu(page);
    await resetPage.fill({ oldPassword: WRONG_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    let locked = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !locked; attempt++) {
      const response = await resetPage.submitAndWaitForApi();
      locked = response.status() === 429;
    }
    expect(locked, '連続で誤った旧パスワードを送っても 429 にならない').toBe(true);
    await expect(page.getByText(PW_RESET_MESSAGES.rateLimited)).toBeVisible();
  });

  // 項番 23〜38: 大文字・小文字・数字・記号の 16 通りの組み合わせ（項目書の並び順）
  const POLICY_COMBINATIONS: [number, boolean, boolean, boolean, boolean][] = [
    [23, false, false, false, false],
    [24, true, false, false, false],
    [25, false, true, false, false],
    [26, false, false, true, false],
    [27, false, false, false, true],
    [28, true, true, false, false],
    [29, true, false, true, false],
    [30, true, false, false, true],
    [31, false, true, true, false],
    [32, false, true, false, true],
    [33, false, false, true, true],
    [34, true, true, true, false],
    [35, true, true, false, true],
    [36, true, false, true, true],
    [37, false, true, true, true],
    [38, true, true, true, true],
  ];

  for (const [number, uppercase, lowercase, digits, symbols] of POLICY_COMBINATIONS) {
    const label = `大文字${uppercase ? 'あり' : 'なし'}・小文字${lowercase ? 'あり' : 'なし'}・数字${digits ? 'あり' : 'なし'}・記号${symbols ? 'あり' : 'なし'}`;
    test(`[05-${number}] パスワードポリシー組み合わせ-${number - 22}`, async ({ loginPage, page }) => {
      const tenant = createPolicyTenant({ minLength: POLICY_MIN_LENGTH, uppercase, lowercase, digits, symbols });
      try {
        const resetPage = await loginToResetPage(page, loginPage, tenant);

        // ポリシーに沿わないパスワード: 必須の文字種のうち 1 つを欠く。必須がなければ最小文字数に足りない
        const required = (
          [
            [uppercase, 'upper'],
            [lowercase, 'lower'],
            [digits, 'digit'],
            [symbols, 'symbol'],
          ] as [boolean, PwClass][]
        )
          .filter(([enabled]) => enabled)
          .map(([, cls]) => cls);
        const invalid = required.length === 0 ? 'abc' : buildPassword(required, required[0]);
        // ポリシーに沿ったパスワード: 必須の文字種をすべて含む
        const valid = buildPassword(required);
        expect(valid.length, `${label}: 有効なパスワードの長さ`).toBeGreaterThanOrEqual(POLICY_MIN_LENGTH);

        await resetPage.fill({ newPassword: invalid, confirmPassword: invalid });
        const rejected = await resetPage.submitAndWaitForApi();
        // パスワード更新に失敗する
        expect(rejected.ok(), `${label}: ポリシーに沿わない「${invalid}」が通ってしまった`).toBe(false);
        await expect(page).toHaveURL(RESET_URL);

        // その後、ポリシーに沿ったパスワードで更新すると成功し、認証後画面に遷移する
        await resetPage.fill({ newPassword: valid, confirmPassword: valid });
        const accepted = await resetPage.submitAndWaitForApi();
        expect(accepted.ok(), `${label}: ポリシーに沿った「${valid}」が拒否された`).toBe(true);
        await expect(page).toHaveURL(DASHBOARD_URL);
      } finally {
        deletePolicyTenant(tenant);
      }
    });
  }
});

/** 文字種ごとの代表の 1 文字（VALID_SYMBOLS に含まれる記号を使う）。 */
const CLASS_CHAR = { upper: 'A', lower: 'a', digit: '1', symbol: '!' } as const;
type PwClass = keyof typeof CLASS_CHAR;
const ALL_CLASSES = Object.keys(CLASS_CHAR) as PwClass[];

/**
 * 必須の文字種を含み、最小文字数まで埋めたパスワードを作る。
 *
 * @param required ポリシーで必須の文字種
 * @param omit 含めない文字種（ポリシーに沿わないパスワードを作るとき）。埋める文字にも使わない
 * @returns パスワード（最小文字数）
 */
function buildPassword(required: PwClass[], omit?: PwClass): string {
  const included = required.filter((cls) => cls !== omit);
  const padClass = included[0] ?? ALL_CLASSES.find((cls) => cls !== omit) ?? 'lower';
  const chars = included.map((cls) => CLASS_CHAR[cls]);
  while (chars.length < POLICY_MIN_LENGTH) chars.push(CLASS_CHAR[padClass]);
  return chars.join('');
}
