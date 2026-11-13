import type { Page } from '@playwright/test';
import { getSessionUser } from '../src/api.ts';
import { expect, test } from '../src/fixtures.ts';
import { DASHBOARD_PATH, LOGIN_MESSAGES, LOGIN_PATH } from '../src/pages/login.page.ts';
import { EXPIRED_PASSWORD_USER, TENANT_ID, USERS } from '../src/users.ts';

/**
 * 03_ログイン（23 項目）。項目書: 25DA61_結合テスト項目書_md/03_ログイン.md
 *
 * 移植元との対応:
 * - このプロジェクトはテナントをサブドメインで識別しない。ログイン画面でテナント ID を入力する（CLAUDE.md「テナント識別方式」）。
 *   項目書の「テナント付き URL」は「テナント ID の入力」に読み替える
 * - ログイン失敗は 403 と "Authentication failed"（項目書 6・7 の備考）。画面の文言は「ユーザIDかパスワードが間違っています」
 */

const LOGIN_API_PATH = '/auth/login';
/** 連続して失敗してよい回数（移植元 LoginAttemptService.FAILURE_THRESHOLD = 6）。この回数目の失敗が 429 になる。 */
const LOCKOUT_FAILURE_COUNT = 6;
const USER_ID_MIN_LENGTH = 3;
const USER_ID_MAX_LENGTH = 50;
/** test-tenant のパスワードポリシーの最小文字数（大小英字・数字・記号を含む 12 文字）。 */
const PASSWORD_MIN_LENGTH_VALUE = 'Spec@Pass12a';

function isLoginRequest(url: string, method: string): boolean {
  return method === 'POST' && new URL(url).pathname === LOGIN_API_PATH;
}

/** ログイン画面の「ログイン」を押して、POST /auth/login の応答を待つ。 */
async function submitAndWaitForLogin(page: Page, submit: () => Promise<void>) {
  const responsePromise = page.waitForResponse((r) => isLoginRequest(r.url(), r.request().method()));
  await submit();
  return responsePromise;
}

/** ログイン後の画面（サイドバーとメイン領域）が表示されている。 */
async function expectAuthenticatedLayout(page: Page): Promise<void> {
  await expect(page.locator('aside').first()).toBeVisible();
  await expect(page.locator('main').first()).toBeVisible();
}

test.describe('03_ログイン', () => {
  test('[03-01] ログイン画面表示', async ({ loginPage, page }) => {
    await page.goto(LOGIN_PATH);
    await loginPage.expectLoaded();
    await expect(loginPage.submitButton).toHaveText(/ログイン/);
    await expect(page.getByLabel('ユーザーID')).toBeVisible();
    await expect(page.getByLabel('パスワード', { exact: true })).toBeVisible();
  });

  test('[03-02] 正常ログイン', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.attemptLogin(USERS.user);
    await expect(page).toHaveURL(new RegExp(DASHBOARD_PATH));
    await expectAuthenticatedLayout(page);
  });

  test('[03-03] ユーザーID未入力', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.fill({ tenantId: TENANT_ID, password: USERS.user.password });
    await loginPage.submit();
    await expect(page.getByText(LOGIN_MESSAGES.required)).toHaveCount(1);
  });

  test('[03-04] パスワード未入力', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.fill({ tenantId: TENANT_ID, loginId: USERS.user.loginId });
    await loginPage.submit();
    await expect(page.getByText(LOGIN_MESSAGES.required)).toHaveCount(1);
  });

  test('[03-05] 両方未入力', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.fill({ tenantId: TENANT_ID });
    await loginPage.submit();
    await expect(page.getByText(LOGIN_MESSAGES.required)).toHaveCount(2);
  });

  test('[03-06] 認証失敗（ID誤り）', async ({ loginPage, page, uniqueId }) => {
    await loginPage.goto();
    const response = await submitAndWaitForLogin(page, () =>
      loginPage.attemptLogin({ tenantId: TENANT_ID, loginId: uniqueId('nobody'), password: 'Wrong@1234' })
    );
    // 項目書の備考: 403 と「Authentication failed」
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain('Authentication failed');
    await expect(loginPage.errorMessage.filter({ hasText: LOGIN_MESSAGES.wrongCredentials })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-07] 認証失敗（PW誤り）', async ({ loginPage, page, createUser }) => {
    const user = await createUser({});
    await loginPage.goto();
    const response = await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user, 'Wrong@1234'));
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain('Authentication failed');
    await expect(loginPage.errorMessage.filter({ hasText: LOGIN_MESSAGES.wrongCredentials })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-08] ログイン試行回数上限', async ({ loginPage, page, createUser }) => {
    // 失敗回数はユーザーごとに数える。ロックされると他のテストに響くため、このテスト専用のユーザーを使う
    const user = await createUser({});
    await loginPage.goto();
    for (let attempt = 1; attempt <= LOCKOUT_FAILURE_COUNT; attempt++) {
      await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user, `Wrong@${attempt}`));
    }
    await expect(loginPage.errorMessage.filter({ hasText: LOGIN_MESSAGES.rateLimited })).toBeVisible();
    // 正しいパスワードでもロック中はログインできない
    const locked = await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user));
    expect(locked.status()).toBe(429);
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-09] パスワード表示切替', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.fill({ password: 'Secret@1234' });
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    await loginPage.passwordToggle.click();
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'text');
    await expect(loginPage.passwordInput).toHaveValue('Secret@1234');
    await loginPage.passwordToggle.click();
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('[03-10] 初回PW遷移', async ({ loginPage, page, createUser }) => {
    // activate: false = 初期パスワードのまま（パスワード設定が必要な状態）
    const user = await createUser({ activate: false });
    await loginPage.goto();
    await loginPage.attemptLogin(user);
    await expect(page).toHaveURL(/\/auth\/password\/reset/);
  });

  test('[03-11] 期限切れPW遷移', async ({ loginPage, page }) => {
    // seed.sql の expired-password-user（password_histories.expired_at が過去）。読むだけで変更しない
    await loginPage.goto();
    await loginPage.attemptLogin(EXPIRED_PASSWORD_USER);
    await expect(page).toHaveURL(/\/auth\/password\/reset/);
  });

  test('[03-12] テナントURL必須確認', async ({ loginPage, page, uniqueId }) => {
    // サブドメインは使わない。テナント ID の入力が、移植元の「テナント付き URL」にあたる
    await loginPage.goto();
    await loginPage.fill({ loginId: USERS.user.loginId, password: USERS.user.password });
    await loginPage.submit();
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));

    await loginPage.fill({ tenantId: uniqueId('no-such-tenant') });
    const failed = await submitAndWaitForLogin(page, () => loginPage.submit());
    expect(failed.ok()).toBe(false);
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));

    await loginPage.fill({ tenantId: TENANT_ID });
    await loginPage.submit();
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-13] 認証後URL直アクセス', async ({ loginAs, page }) => {
    await loginAs('user');
    await page.goto(LOGIN_PATH);
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
    await expectAuthenticatedLayout(page);
  });

  test('[03-14] 利用規約リンク表示', async ({ loginPage, page }) => {
    await loginPage.goto();
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: '利用規約' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'ユニリタ' })).toBeVisible();
  });

  test('[03-15] ユーザーID最小文字数', async ({ loginPage, page, createUser }) => {
    const user = await createUser({ loginId: 'a'.repeat(USER_ID_MIN_LENGTH) });
    await loginPage.goto();
    const response = await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user));
    expect(response.ok()).toBe(true);
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-16] ユーザーID最大文字数', async ({ loginPage, page, createUser }) => {
    const user = await createUser({ loginId: 'b'.repeat(USER_ID_MAX_LENGTH) });
    await loginPage.goto();
    const response = await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user));
    expect(response.ok()).toBe(true);
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-17] ユーザーID文字数不足', async ({ loginPage, page }) => {
    await loginPage.goto();
    const requests: string[] = [];
    page.on('request', (r) => {
      if (isLoginRequest(r.url(), r.method())) requests.push(r.url());
    });
    await loginPage.attemptLogin({
      tenantId: TENANT_ID,
      loginId: 'c'.repeat(USER_ID_MIN_LENGTH - 1),
      password: 'Any@1234',
    });
    // バリデーションエラー（移植元 VALIDATION.MIN_LENGTH）が画面に出て、認証の API は呼ばれない
    await expect(page.getByText(`${USER_ID_MIN_LENGTH}文字以上で入力してください`)).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test('[03-18] パスワード最小文字数', async ({ loginPage, page, createUser }) => {
    const user = await createUser({ password: PASSWORD_MIN_LENGTH_VALUE });
    await loginPage.goto();
    const response = await submitAndWaitForLogin(page, () => loginPage.attemptLogin(user));
    expect(response.ok()).toBe(true);
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-19] 正常ログイン Chrome', async ({ loginPage, page, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で確かめる。Chrome 本体（channel: chrome）ではない
    expect(browserName).toBe('chromium');
    await loginPage.goto();
    await loginPage.attemptLogin(USERS.user);
    await expect(page).toHaveURL(new RegExp(DASHBOARD_PATH));
  });

  test('[03-20] ログインキーを使ったログイン（正常系_既存セッションなし）', async ({ page, createUser }) => {
    const target = await createUser({ issueLoginKey: true });
    await page.goto(`${DASHBOARD_PATH}?loginkey=${target.loginKey}&tenantId=${TENANT_ID}`);
    // ログイン画面を経由せずにログインできる
    await expect(page).not.toHaveURL(new RegExp(LOGIN_PATH));
    await expectAuthenticatedLayout(page);
    // GET /api/auth の id は users.id ではなくログイン ID
    expect((await getSessionUser(page.request))?.id).toBe(target.loginId);
  });

  test('[03-21] ログインキーを使ったログイン（正常系_既存セッションあり）', async ({ loginAs, page, createUser }) => {
    const target = await createUser({ issueLoginKey: true });
    await loginAs('user');
    await page.goto(`${DASHBOARD_PATH}?loginkey=${target.loginKey}&tenantId=${TENANT_ID}`);
    await expectAuthenticatedLayout(page);
    // ログイン中のユーザー（user01）とは別の、ログインキーのユーザーに切り替わる
    await expect.poll(async () => (await getSessionUser(page.request))?.id).toBe(target.loginId);
  });

  test('[03-22] ログインキーを使ったログイン（異常系_既存セッションなし）', async ({ page, uniqueId }) => {
    await page.goto(`${DASHBOARD_PATH}?loginkey=${uniqueId('invalid')}&tenantId=${TENANT_ID}`);
    await expect(page).toHaveURL(new RegExp(LOGIN_PATH));
  });

  test('[03-23] ログインキーを使ったログイン（異常系_既存セッションあり）', async ({ loginAs, page, uniqueId }) => {
    const current = await loginAs('user');
    await page.goto(`${DASHBOARD_PATH}?loginkey=${uniqueId('invalid')}&tenantId=${TENANT_ID}`);
    // 3 つの確認は、どれが満たされないかを NG の内容に全部出すため soft にする
    // ログイン中のユーザーのまま、サービスにアクセスできる
    await expect.soft(page).not.toHaveURL(new RegExp(LOGIN_PATH));
    expect.soft((await getSessionUser(page.request))?.id, 'セッションがログイン中のユーザーのまま').toBe(current.loginId);
    // アラート（トースト）が表示される
    // トーストは role=alert の div とその中の文言の 2 要素に一致するため、先頭だけを見る（strict mode 対策）
    await expect.soft(page.getByRole('alert').or(page.getByText('不正なログインキーです')).first()).toBeVisible();
  });
});
