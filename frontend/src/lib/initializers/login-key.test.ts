import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveTenantId } from '@/lib/api-client';
import { runLoginKeyInitializer } from './login-key';

function openUrl(pathWithQuery: string) {
  window.history.replaceState(null, '', pathWithQuery);
}

describe('runLoginKeyInitializer', () => {
  afterEach(() => {
    openUrl('/');
  });

  test('URL に loginkey が無ければ何もしないこと', async () => {
    openUrl('/dashboard?tab=a');
    const loginWithKey = vi.fn();

    await runLoginKeyInitializer({ loginWithKey });

    expect(loginWithKey).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?tab=a');
  });

  test('loginkey とテナントIDで認証し、URL から認証パラメータだけを消すこと', async () => {
    openUrl('/dashboard?loginkey=key-1&tenantId=tenant-a&tab=b');
    const loginWithKey = vi.fn().mockResolvedValue(true);
    const onError = vi.fn();

    await runLoginKeyInitializer({ loginWithKey, onError });

    expect(loginWithKey).toHaveBeenCalledWith('key-1');
    expect(resolveTenantId()).toBe('tenant-a');
    expect(window.location.pathname).toBe('/dashboard');
    expect(window.location.search).toBe('?tab=b');
    expect(onError).not.toHaveBeenCalled();
  });

  test('認証に失敗したらエラー通知を呼び、URL からは鍵を消すこと', async () => {
    openUrl('/dashboard?loginkey=bad-key');
    const onError = vi.fn();

    await runLoginKeyInitializer({ loginWithKey: vi.fn().mockResolvedValue(false), onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  test('続けて2回呼ばれても認証は1回だけであること（StrictMode の二重実行）', async () => {
    openUrl('/dashboard?loginkey=key-1');
    const loginWithKey = vi.fn().mockResolvedValue(true);

    await Promise.all([
      runLoginKeyInitializer({ loginWithKey }),
      runLoginKeyInitializer({ loginWithKey }),
    ]);

    expect(loginWithKey).toHaveBeenCalledTimes(1);
  });

  test('認証中に呼ばれた2回目は、認証が終わるまで待つこと（先にセッション確認へ進まない）', async () => {
    openUrl('/dashboard?loginkey=key-1');
    let finishLogin: (ok: boolean) => void = () => undefined;
    const loginWithKey = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishLogin = resolve;
        })
    );
    const order: string[] = [];

    const first = runLoginKeyInitializer({ loginWithKey }).then(() => order.push('first'));
    const second = runLoginKeyInitializer({ loginWithKey }).then(() => order.push('second'));
    await Promise.resolve();
    expect(order).toEqual([]);

    finishLogin(true);
    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
  });
});
