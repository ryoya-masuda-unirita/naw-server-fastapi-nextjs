import type { Page } from '@playwright/test';
import type { ExplorerConfig, Shard } from './config.ts';

/**
 * ログイン画面を通したログインと、ログインした状態の復元。
 *
 * このアプリはテナント ID とユーザー情報を sessionStorage に持つ（タブごとに消える）。
 * Cookie はコンテキストで共有されるが sessionStorage は共有されないため、
 * ログイン後の sessionStorage を控えておき、新しいタブを開くたびに init script で戻す。
 */

export class LoginError extends Error {}

export type SessionSnapshot = Record<string, string>;

export async function loginThroughUi(page: Page, config: ExplorerConfig, shard: Shard): Promise<SessionSnapshot> {
  const role = shard.roleConfig;
  if (role.anonymous || !shard.tenantId || !role.loginId || !role.password) {
    throw new LoginError(`担当範囲 ${shard.id} の権限 ${shard.role} はログインしません`);
  }
  const login = config.target.login;
  const loginUrl = new URL(login.path, config.target.baseUrl).toString();
  const timeout = config.timing.navigationTimeoutMs;

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout });
  await page.locator(login.tenantField).fill(shard.tenantId, { timeout });
  await page.locator(login.userField).fill(role.loginId, { timeout });
  await page.locator(login.passwordField).fill(role.password, { timeout });
  await page.locator(login.submit).click({ timeout });
  try {
    await page.waitForURL((url) => url.pathname !== login.path, { timeout });
  } catch {
    const message = await page
      .locator('[role=alert], .text-status-error')
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null);
    throw new LoginError(
      `ログインできません（担当範囲 ${shard.id}・テナント ${shard.tenantId}・ユーザー ${role.loginId}）` +
        (message ? `: ${message.trim()}` : '。専用テナントを作ったか（env:up）を確かめてください')
    );
  }
  return captureSessionStorageAfterNavigation(page);
}

const CAPTURE_RETRIES = 10;

/**
 * ログイン後、アプリは window.location.href で画面ごと遷移し直す（さらに認証の確認で
 * 別の画面へ移ることもある）。遷移の途中で読むと評価の文脈が壊れて失敗するため、
 * 読み込みが終わるのを待って読み直す。
 */
async function captureSessionStorageAfterNavigation(page: Page): Promise<SessionSnapshot> {
  let lastError: unknown;
  for (let i = 0; i < CAPTURE_RETRIES; i++) {
    await page.waitForLoadState('load');
    try {
      return await captureSessionStorage(page);
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(200);
    }
  }
  throw new LoginError(`ログイン後の sessionStorage を読めません: ${String(lastError)}`);
}

export async function captureSessionStorage(page: Page): Promise<SessionSnapshot> {
  return page.evaluate(() => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key !== null) entries[key] = sessionStorage.getItem(key) ?? '';
    }
    return entries;
  });
}

/**
 * 新しいタブに sessionStorage を戻す init script を入れる。
 * 復元は最初の 1 回だけにする（アプリがログアウトで消した値を、遷移のたびに戻さないため）。
 */
export async function restoreSessionOnNewPage(page: Page, snapshot: SessionSnapshot): Promise<void> {
  await page.addInitScript((entries: Record<string, string>) => {
    const marker = '__e2eExplorerSessionRestored';
    if (sessionStorage.getItem(marker)) return;
    for (const [key, value] of Object.entries(entries)) sessionStorage.setItem(key, value);
    sessionStorage.setItem(marker, '1');
  }, snapshot);
}
