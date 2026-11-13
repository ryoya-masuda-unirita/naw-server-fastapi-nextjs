import { expect, type Locator, type Page } from '@playwright/test';
import type { SeedUser } from '../users.ts';

/** ログイン画面（/auth/login）の Page Object。 */

export const LOGIN_PATH = '/auth/login';
/** ログイン後の画面（ダッシュボード）。 */
export const DASHBOARD_PATH = '/dashboard';

/** 画面の文言（public/i18n/ja.json の AUTH.LOGIN.*。移植元の ja.json と同じ）。 */
export const LOGIN_MESSAGES = {
  wrongCredentials: 'ユーザIDかパスワードが間違っています',
  rateLimited:
    '認証情報入力の試行回数が上限を超えたため、一定時間アカウントをロックしました。しばらく時間を空けて再度お試しください。',
  unexpected: '予期しないエラーが発生しました。もう一度お試しください。',
  required: 'この項目は必須です',
} as const;

export class LoginPage {
  readonly tenantInput: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly passwordToggle: Locator;
  /** ログイン失敗などのエラー表示（フォーム上部の帯、または入力欄の下の文言）。 */
  readonly errorMessage: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.tenantInput = page.locator('#tenantId');
    this.usernameInput = page.locator('#username');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.locator('form button[type=submit]');
    this.passwordToggle = page.getByRole('button', { name: /(Show|Hide) password/ });
    this.errorMessage = page.locator('.text-status-error');
  }

  /** ログイン画面を開く。 */
  async goto(): Promise<void> {
    await this.page.goto(LOGIN_PATH);
    await this.expectLoaded();
  }

  /** ログイン画面が表示されている（入力欄とボタンが出ている）。 */
  async expectLoaded(): Promise<void> {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * 入力欄に値を入れる（送信はしない）。undefined の欄は触らない。
   *
   * @param values テナント ID・ユーザー ID・パスワード
   */
  async fill(values: { tenantId?: string; loginId?: string; password?: string }): Promise<void> {
    if (values.tenantId !== undefined) await this.tenantInput.fill(values.tenantId);
    if (values.loginId !== undefined) await this.usernameInput.fill(values.loginId);
    if (values.password !== undefined) await this.passwordInput.fill(values.password);
  }

  /** 「ログイン」を押す。 */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * 入力して「ログイン」を押す（結果は待たない）。
   *
   * @param user ログインするユーザー
   * @param password パスワードを上書きするとき（誤ったパスワードの試行など）
   */
  async attemptLogin(user: Pick<SeedUser, 'tenantId' | 'loginId' | 'password'>, password?: string): Promise<void> {
    await this.fill({ tenantId: user.tenantId, loginId: user.loginId, password: password ?? user.password });
    await this.submit();
  }

  /**
   * ログイン画面からログインし、ログイン後の画面に着くまで待つ。
   *
   * @param user ログインするユーザー
   */
  async login(user: Pick<SeedUser, 'tenantId' | 'loginId' | 'password'>): Promise<void> {
    await this.goto();
    await this.attemptLogin(user);
    await expect(this.page).not.toHaveURL(new RegExp(`${LOGIN_PATH}`));
  }
}
