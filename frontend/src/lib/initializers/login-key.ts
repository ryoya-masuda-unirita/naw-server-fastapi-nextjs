import { clearTenantId, persistTenantId, resolveTenantId } from '@/lib/api-client';

// 移植元 core/initializers/login-key.initializer.ts。
// URL クエリ `loginkey` があれば、ルーティング・セッション確認より前に `POST /auth/login-key` で認証する。

const LOGIN_KEY_QUERY = 'loginkey';
// サブドメインでテナントを判定しないため、テナントIDもクエリで受け取る（X-Tenant-ID ヘッダに使う）
const TENANT_ID_QUERY = 'tenantId';

export interface LoginKeyInitializerDeps {
  loginWithKey: (loginKey: string) => Promise<boolean>;
  /** 認証に失敗したとき（移植元はトーストで翻訳キー AUTH.LOGIN_KEY.ERROR の文言を出す） */
  onError?: () => void | Promise<void>;
}

// 認証中にもう一度呼ばれたら同じ処理を待たせる。React の StrictMode（開発時）は初期化の effect を2回走らせ、
// 2回目がすぐにセッション確認（GET /api/auth）へ進むと、ログインキーの認証より先に未ログインと判定されるため
let inFlight: Promise<void> | null = null;

export function runLoginKeyInitializer(deps: LoginKeyInitializerDeps): Promise<void> {
  if (!inFlight) {
    inFlight = authenticateWithLoginKey(deps).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function authenticateWithLoginKey(deps: LoginKeyInitializerDeps): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const loginKey = params.get(LOGIN_KEY_QUERY);
  if (!loginKey) return;

  const tenantId = params.get(TENANT_ID_QUERY);
  // 認証に失敗したとき、ログイン中のセッションが使っているテナントIDに戻すために控える
  const previousTenantId = resolveTenantId();
  if (tenantId) {
    persistTenantId(tenantId);
  }

  // 履歴・ブックマークに鍵を残さないよう、URL から認証パラメータを消す（移植元は認証後だが、失敗しても消す点は同じ）
  params.delete(LOGIN_KEY_QUERY);
  params.delete(TENANT_ID_QUERY);
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));

  const ok = await deps.loginWithKey(loginKey);
  if (!ok) {
    // URL の tenantId で上書きした分を戻す。ログイン中なら続くセッション確認（GET /api/auth）が元のテナントで通り、
    // 未ログインなら誤ったテナントIDを残さない
    if (previousTenantId) {
      persistTenantId(previousTenantId);
    } else {
      clearTenantId();
    }
    await deps.onError?.();
  }
}
