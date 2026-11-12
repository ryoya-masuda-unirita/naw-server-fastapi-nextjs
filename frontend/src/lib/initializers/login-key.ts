import { persistTenantId } from '@/lib/api-client';

// 移植元 core/initializers/login-key.initializer.ts。
// URL クエリ `loginkey` があれば、ルーティング・セッション確認より前に `POST /auth/login-key` で認証する。

const LOGIN_KEY_QUERY = 'loginkey';
// サブドメインでテナントを判定しないため、テナントIDもクエリで受け取る（X-Tenant-ID ヘッダに使う）
const TENANT_ID_QUERY = 'tenantId';

export const LOGIN_KEY_ERROR_MESSAGE_KEY = 'AUTH.LOGIN_KEY.ERROR';

export interface LoginKeyInitializerDeps {
  loginWithKey: (loginKey: string) => Promise<boolean>;
  /** 認証に失敗したとき（移植元はトーストで AUTH.LOGIN_KEY.ERROR を出す） */
  onError?: () => void;
}

export async function runLoginKeyInitializer(deps: LoginKeyInitializerDeps): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const loginKey = params.get(LOGIN_KEY_QUERY);
  if (!loginKey) return;

  const tenantId = params.get(TENANT_ID_QUERY);
  if (tenantId) {
    persistTenantId(tenantId);
  }

  // 履歴・ブックマークに鍵を残さないよう、URL から認証パラメータを消す。
  // 移植元は認証後に消すが、React の StrictMode（開発時）は初期化の effect を2回走らせるため、
  // 先に消して2回目の呼び出しで再認証しないようにする
  params.delete(LOGIN_KEY_QUERY);
  params.delete(TENANT_ID_QUERY);
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));

  const ok = await deps.loginWithKey(loginKey);
  if (!ok) {
    deps.onError?.();
  }
}
