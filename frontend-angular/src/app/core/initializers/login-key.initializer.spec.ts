/**
 * `runLoginKeyInitializer` の単体テスト。
 *
 * App Initializer 本体ロジック。URL の `loginkey` クエリを検出して AuthStore.loginWithKey を呼び、
 * 処理後に URL から認証パラメータを除去する。injection context 内で実行される前提なので
 * TestBed.runInInjectionContext で実行する。
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@core/constants';
import { runLoginKeyInitializer } from '@core/initializers/login-key.initializer';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { TranslateService } from '@ngx-translate/core';

describe('runLoginKeyInitializer（loginkey 初期化）', () => {
  let loginWithKey: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  // 現在の URL を書き換えるヘルパ（happy-dom は history API で location を更新する）
  const setUrl = (path: string) => history.replaceState(null, '', path);

  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    setUrl('/');
    loginWithKey = vi.fn().mockResolvedValue(true);
    toastError = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { loginWithKey } },
        { provide: ToastService, useValue: { error: toastError } },
        {
          provide: TranslateService,
          useValue: {
            get: (key: string) =>
              of(key === 'AUTH.LOGIN_KEY.ERROR' ? '不正なログインキーです' : key),
          },
        },
      ],
    });
  });

  const run = () => TestBed.runInInjectionContext(() => runLoginKeyInitializer());

  it('loginkey が無いときは何もしない', async () => {
    setUrl('/?foo=bar');

    await run();

    expect(loginWithKey).not.toHaveBeenCalled();
    // URL は変更されない
    expect(window.location.search).toBe('?foo=bar');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('loginkey があるとき AuthStore.loginWithKey を呼び、URL から認証パラメータを除去する', async () => {
    setUrl('/?loginkey=key-123&tenantId=tenant-x&foo=bar');

    await run();

    expect(loginWithKey).toHaveBeenCalledWith('key-123');
    // tenantId は X-Tenant-ID 付与用に sessionStorage へ保存
    expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('tenant-x');
    // loginkey / tenantId は URL から消え、無関係なクエリは残る
    const params = new URLSearchParams(window.location.search);
    expect(params.get('loginkey')).toBeNull();
    expect(params.get('tenantId')).toBeNull();
    expect(params.get('foo')).toBe('bar');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('tenantId クエリが無ければ sessionStorage に保存しないが loginkey 認証は行う', async () => {
    setUrl('/?loginkey=key-123');

    await run();

    expect(loginWithKey).toHaveBeenCalledWith('key-123');
    expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
    // 残りのクエリが無いので search は空になる
    expect(window.location.search).toBe('');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('loginkey 認証に失敗したときエラートーストを表示し、URL から認証パラメータを除去する', async () => {
    setUrl('/?loginkey=bad-key&tenantId=tenant-x&foo=bar');
    loginWithKey.mockResolvedValue(false);

    await run();

    expect(loginWithKey).toHaveBeenCalledWith('bad-key');
    expect(toastError).toHaveBeenCalledWith('不正なログインキーです');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('loginkey')).toBeNull();
    expect(params.get('tenantId')).toBeNull();
    expect(params.get('foo')).toBe('bar');
  });
});
