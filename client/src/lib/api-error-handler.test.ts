import { describe, expect, test, vi } from 'vitest';
import { ApiError, type ApiErrorContext, type HttpMethod } from './api-client';
import {
  createApiErrorHandler,
  resolveErrorMessageKey,
  shouldInvalidateSession,
  shouldShowErrorToast,
} from './api-error-handler';

function context(
  status: number,
  path: string,
  overrides: Partial<Omit<ApiErrorContext, 'error'>> = {},
  method: HttpMethod = 'GET'
): ApiErrorContext {
  return {
    error: new ApiError({ status, body: null, method, path }),
    skipGlobalErrorToast: false,
    skipSessionInvalidation: false,
    ...overrides,
  };
}

describe('API エラーの共通処理（移植元 errorInterceptor）', () => {
  describe('トーストの文言', () => {
    test.each([
      [403, 'COMMON.MESSAGES.ERROR.FORBIDDEN'],
      [404, 'COMMON.MESSAGES.ERROR.NOT_FOUND'],
      [500, 'COMMON.MESSAGES.ERROR.SERVER_ERROR'],
      [503, 'COMMON.MESSAGES.ERROR.SERVER_ERROR'],
      [400, 'COMMON.MESSAGES.ERROR.GENERAL'],
      [0, 'COMMON.MESSAGES.ERROR.GENERAL'],
    ])('status %i のとき %s になること', (status, key) => {
      expect(resolveErrorMessageKey(status)).toBe(key);
    });
  });

  describe('トーストを出すか', () => {
    test('通常の API エラーではトーストを出すこと', () => {
      expect(shouldShowErrorToast(context(500, '/api/rooms'))).toBe(true);
    });

    test('呼び出し側がトーストを抑止したら出さないこと', () => {
      expect(
        shouldShowErrorToast(context(500, '/api/rooms', { skipGlobalErrorToast: true }))
      ).toBe(false);
    });

    test.each(['/auth/login', '/auth/login-key'])(
      'ログイン（%s）の 401・403 では出さないこと',
      (path) => {
        expect(shouldShowErrorToast(context(401, path))).toBe(false);
        expect(shouldShowErrorToast(context(403, path))).toBe(false);
      }
    );

    test('ログイン・パスワードリセットの 429 では出さないこと', () => {
      expect(shouldShowErrorToast(context(429, '/auth/login'))).toBe(false);
      expect(shouldShowErrorToast(context(429, '/auth/password/reset'))).toBe(false);
    });

    test('パスワードリセットの 401 ではトーストを出すこと', () => {
      expect(shouldShowErrorToast(context(401, '/auth/password/reset'))).toBe(true);
    });
  });

  describe('401 でセッションを破棄するか', () => {
    test('通常の API の 401 では破棄すること', () => {
      expect(shouldInvalidateSession(context(401, '/api/rooms'))).toBe(true);
    });

    test('401 以外では破棄しないこと', () => {
      expect(shouldInvalidateSession(context(403, '/api/rooms'))).toBe(false);
    });

    test.each(['/api/auth', '/auth/login', '/auth/login-key', '/auth/password/reset'])(
      'セッション確認・認証 API（%s）の 401 では破棄しないこと',
      (path) => {
        expect(shouldInvalidateSession(context(401, path))).toBe(false);
      }
    );

    test('ローカルサーバなど破棄しない指定のリクエストでは破棄しないこと', () => {
      expect(
        shouldInvalidateSession(context(401, '/api/rooms', { skipSessionInvalidation: true }))
      ).toBe(false);
    });
  });

  describe('createApiErrorHandler', () => {
    test('トーストに翻訳した文言を渡し、401 ならログイン画面へ戻す処理を呼ぶこと', () => {
      const showErrorToast = vi.fn();
      const onUnauthorized = vi.fn();
      const handler = createApiErrorHandler({
        translate: (key) => `translated:${key}`,
        showErrorToast,
        onUnauthorized,
      });

      handler(context(401, '/api/rooms'));

      expect(showErrorToast).toHaveBeenCalledWith('translated:COMMON.MESSAGES.ERROR.GENERAL');
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    test('トーストが未指定でもエラーにならないこと', () => {
      const onUnauthorized = vi.fn();
      const handler = createApiErrorHandler({ translate: (key) => key, onUnauthorized });

      expect(() => handler(context(404, '/api/rooms'))).not.toThrow();
      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });
});
