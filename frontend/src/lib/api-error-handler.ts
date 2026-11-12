import type { ApiErrorContext, ApiErrorHandler } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';

// 移植元 core/interceptors/error.interceptor.ts の判定部分。
// Router・i18n・トーストは依存として受け取り、判定だけをテストできるようにする。

const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

const SERVER_ERROR_MIN_STATUS = 500;

export const API_ERROR_MESSAGE_KEYS = {
  FORBIDDEN: 'COMMON.MESSAGES.ERROR.FORBIDDEN',
  NOT_FOUND: 'COMMON.MESSAGES.ERROR.NOT_FOUND',
  SERVER_ERROR: 'COMMON.MESSAGES.ERROR.SERVER_ERROR',
  GENERAL: 'COMMON.MESSAGES.ERROR.GENERAL',
} as const;

export function resolveErrorMessageKey(status: number): string {
  if (status === HTTP_STATUS.FORBIDDEN) return API_ERROR_MESSAGE_KEYS.FORBIDDEN;
  if (status === HTTP_STATUS.NOT_FOUND) return API_ERROR_MESSAGE_KEYS.NOT_FOUND;
  if (status >= SERVER_ERROR_MIN_STATUS) return API_ERROR_MESSAGE_KEYS.SERVER_ERROR;
  return API_ERROR_MESSAGE_KEYS.GENERAL;
}

/**
 * 共通のエラートーストを出すか。
 * ログイン失敗（401/403）と認証系の 429 は、ログイン画面・パスワードリセット画面が自分で表示するため出さない。
 * 移植元と同じく includes で判定するため、`/auth/login-key` もログインとして扱う。
 */
export function shouldShowErrorToast({ error, skipGlobalErrorToast }: ApiErrorContext): boolean {
  if (skipGlobalErrorToast) return false;
  const isLoginPath = error.path.includes(API_PATHS.AUTH.LOGIN);
  const isPasswordResetPath = error.path.includes(API_PATHS.AUTH.PASSWORD_RESET);
  const isAuthPath = isLoginPath || isPasswordResetPath;
  const isLoginFailure =
    isLoginPath &&
    (error.status === HTTP_STATUS.UNAUTHORIZED || error.status === HTTP_STATUS.FORBIDDEN);
  const isAuthRateLimited = error.status === HTTP_STATUS.TOO_MANY_REQUESTS && isAuthPath;
  return !isLoginFailure && !isAuthRateLimited;
}

/**
 * 401 でセッションを破棄してログイン画面へ戻すか。
 * 移植元は `url.includes('/auth')`（セッション確認 `/auth` を想定）で除外しており、結果として
 * ログイン・ログインキー・パスワードリセット（`/auth/...`）とセッション確認の 401 では破棄しない。
 * React はセッション確認が `/api/auth` のため、両方を明示して同じ範囲を除外する。
 */
export function shouldInvalidateSession({
  error,
  skipSessionInvalidation,
}: ApiErrorContext): boolean {
  if (error.status !== HTTP_STATUS.UNAUTHORIZED || skipSessionInvalidation) return false;
  const isSessionPath = error.path === API_PATHS.AUTH.SESSION;
  const isAuthApiPath = error.path.startsWith('/auth/');
  return !isSessionPath && !isAuthApiPath;
}

export interface ApiErrorHandlerDeps {
  translate: (key: string) => string;
  /** トースト（#278 で移植）ができるまでは未指定でよい。未指定なら表示しない。 */
  showErrorToast?: (message: string) => void;
  onUnauthorized: () => void;
}

export function createApiErrorHandler(deps: ApiErrorHandlerDeps): ApiErrorHandler {
  return (context) => {
    if (shouldShowErrorToast(context)) {
      deps.showErrorToast?.(deps.translate(resolveErrorMessageKey(context.error.status)));
    }
    if (shouldInvalidateSession(context)) {
      deps.onUnauthorized();
    }
    // 移植元と同じく、403・500 は原因調査のためにコンソールへ残す
    if (context.error.status === HTTP_STATUS.FORBIDDEN) {
      console.error('[API] Forbidden:', context.error.body);
    } else if (context.error.status === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      console.error('[API] Server error:', context.error.body);
    }
  };
}
