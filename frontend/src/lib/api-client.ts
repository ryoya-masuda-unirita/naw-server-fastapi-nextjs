// 本番ビルド（.env.production）では空文字になり、配信元と同じオリジンの相対パスで呼ぶ
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
// 認証API（/auth/...）は画面（/auth/login 等）と同じパスのため、dev環境（CloudFront）では
// 本番ビルドで /backend を付けて呼び分ける（#240）。移植元の authBaseUrl に相当する。
// 未指定（ローカル開発・テスト）なら他のAPIと同じベースURLを使う。
const AUTH_API_BASE_URL = import.meta.env.VITE_AUTH_API_URL ?? API_BASE_URL;
const AUTH_API_PATH_PREFIX = '/auth/';

type QueryParams = Record<string, string | number | boolean>;

// ベースURLが空（相対パス）でも URL を組み立てられるよう、配信元オリジンを基準にする。
// ベースURLが絶対URLのときは第2引数は無視されるため、ローカル開発の挙動は変わらない。
function buildUrl(path: string, params?: QueryParams): string {
  const baseUrl = path.startsWith(AUTH_API_PATH_PREFIX) ? AUTH_API_BASE_URL : API_BASE_URL;
  const url = new URL(`${baseUrl}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      url.searchParams.append(k, String(v));
    });
  }
  return url.toString();
}

// テナントはサブドメインから判定せず、ログイン画面で入力された値をセッションに保存して使う（#193・#229）
const TENANT_ID_STORAGE_KEY = 'TENANT_ID';

export function resolveTenantId(): string {
  return sessionStorage.getItem(TENANT_ID_STORAGE_KEY) || '';
}

export function persistTenantId(tenantId: string): void {
  sessionStorage.setItem(TENANT_ID_STORAGE_KEY, tenantId);
}

export function clearTenantId(): void {
  sessionStorage.removeItem(TENANT_ID_STORAGE_KEY);
}

function getHeaders(customHeaders?: HeadersInit): Record<string, string> {
  const tenantId = resolveTenantId();
  return {
    'Content-Type': 'application/json',
    ...(tenantId && { 'X-Tenant-ID': tenantId }),
    ...(customHeaders as Record<string, string>),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type RequestOptions = RequestInit & {
  params?: QueryParams;
};

export const apiClient = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const res = await fetch(buildUrl(path, options?.params), {
      ...options,
      method: 'GET',
      headers: getHeaders(options?.headers),
      credentials: 'include',
    });
    return handleResponse<T>(res);
  },

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const res = await fetch(buildUrl(path), {
      ...options,
      method: 'POST',
      headers: getHeaders(options?.headers),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },
};
