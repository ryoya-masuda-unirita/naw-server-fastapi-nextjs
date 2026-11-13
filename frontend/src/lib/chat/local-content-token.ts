import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { AuthSessionResponse } from '@/types/auth';

/**
 * SECURE のローカルサーバーへ送るときに使う Waha 委譲トークンを、GET /api/auth から取得する。
 * 送信のたびに取得する（キャッシュしない。移植元 AuthApiService.getAccessTokenForLocalContent）。
 *
 * Raises
 * ------
 * Error
 *     セッションにトークンが無いとき。
 */
export async function getAccessTokenForLocalContent(): Promise<string> {
  const session = await apiClient.get<AuthSessionResponse | null>(API_PATHS.AUTH.SESSION);
  const token = session?.token?.trim();
  if (!token) {
    throw new Error('No access token in auth session');
  }
  return token;
}
