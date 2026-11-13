import { expect, type Locator, type Page, type Response } from '@playwright/test';

/** パスワード設定画面（/auth/password/reset）の Page Object。 */

export const PW_RESET_PATH = '/auth/password/reset';

/** 画面の文言（public/i18n/ja.json の AUTH.PW_RESET.* ・ VALIDATION.*。移植元の ja.json と同じ）。 */
export const PW_RESET_MESSAGES = {
  title: 'パスワード設定',
  submit: 'パスワードを更新',
  success: 'パスワードを更新しました。',
  required: 'この項目は必須です',
  mismatch: 'パスワードが一致しません',
  rateLimited:
    '認証情報入力の試行回数が上限を超えたため、一定時間アカウントをロックしました。しばらく時間を空けて再度お試しください。',
} as const;

export type PwField = 'username' | 'oldPassword' | 'newPassword' | 'confirmPassword';

export class PasswordResetPage {
  readonly page: Page;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.submitButton = page.getByRole('button', { name: PW_RESET_MESSAGES.submit });
  }

  /**
   * 入力欄（id は移植元の formControlName と同じ）。
   *
   * @param field 欄の名前
   * @returns 入力欄
   */
  input(field: PwField): Locator {
    return this.page.locator(`#${field}`);
  }

  /**
   * 欄のまとまり（ラベル・エラー文言・入力欄）。エラー文言は欄ごとに確かめるために使う。
   *
   * @param field 欄の名前
   * @returns 欄を囲む要素
   */
  group(field: PwField): Locator {
    return this.page.locator('.app-form-input', { has: this.input(field) });
  }

  /**
   * 欄の表示/非表示切替ボタン。
   *
   * @param field パスワード欄の名前
   * @returns 切替ボタン
   */
  toggle(field: Exclude<PwField, 'username'>): Locator {
    return this.group(field).getByRole('button', { name: /(Show|Hide) password/ });
  }

  /** 画面が表示されている（見出しとボタン）。 */
  async expectLoaded(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: PW_RESET_MESSAGES.title })).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * 入力欄に値を入れる。undefined の欄は触らない。
   *
   * @param values 欄ごとの値
   */
  async fill(values: Partial<Record<PwField, string>>): Promise<void> {
    for (const [field, value] of Object.entries(values) as [PwField, string][]) {
      await this.input(field).fill(value);
    }
  }

  /** 「パスワードを更新」を押す。 */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * 更新 API（POST /auth/password/reset）の応答を待ちながら「パスワードを更新」を押す。
   *
   * @returns API の応答
   */
  async submitAndWaitForApi(): Promise<Response> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/auth/password/reset'
    );
    await this.submit();
    return responsePromise;
  }
}
