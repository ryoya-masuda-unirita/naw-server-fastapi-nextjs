const API_BASE_URL = import.meta.env.VITE_API_URL;

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
  params?: Record<string, string | number | boolean>;
};

export const apiClient = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        url.searchParams.append(k, String(v));
      });
    }
    const res = await fetch(url.toString(), {
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
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      headers: getHeaders(options?.headers),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },
};
