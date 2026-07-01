const API_BASE_URL = `${import.meta.env.VITE_API_URL}/api`;

function resolveTenantId(): string {
  return sessionStorage.getItem('TENANT_ID') || '';
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
      headers: this._getHeaders(options?.headers),
      credentials: 'include',
    });
    return this._handleResponse<T>(res);
  },

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method: 'POST',
      headers: this._getHeaders(options?.headers),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return this._handleResponse<T>(res);
  },

  private _getHeaders(customHeaders?: HeadersInit): Record<string, string> {
    const tenantId = resolveTenantId();
    return {
      'Content-Type': 'application/json',
      ...(tenantId && { 'X-Tenant-ID': tenantId }),
      ...(customHeaders as Record<string, string>),
    };
  },

  private async _handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  },
};
