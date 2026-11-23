// 本番ビルド（.env.production）では空文字になり、配信元と同じオリジンの相対パスで呼ぶ
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
// 認証API（/auth/...）は画面（/auth/login 等）と同じパスのため、dev環境（CloudFront）では
// 本番ビルドで /backend を付けて呼び分ける（#240）。移植元の authBaseUrl に相当する。
// 未指定（ローカル開発・テスト）なら他のAPIと同じベースURLを使う。
const AUTH_API_BASE_URL = import.meta.env.VITE_AUTH_API_URL ?? API_BASE_URL;
export const AUTH_API_PATH_PREFIX = '/auth/';
// 移植元の *FromCustomUrl（ローカルサーバ向け）に相当。ベースURLを付けずにそのまま送る
const ABSOLUTE_URL_PATTERN = /^https?:\/\//;
// fetch 自体が失敗した（ネットワーク断・CORS）ときの status。Angular の HttpErrorResponse と同じく 0 にする
const NETWORK_ERROR_STATUS = 0;
const NO_CONTENT_STATUS = 204;

type QueryValue = string | number | boolean;

/**
 * 配列を渡すと同じキーを繰り返して送る（例: `tagIds=a&tagIds=b`）。
 * undefined・null の値は送らない（移植元の buildParams は undefined を除外する。null を "null" と送る意味はないため除外する）。
 */
export type QueryParams = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

export type ApiResponseType = 'json' | 'text' | 'blob';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'method' | 'headers'> {
  params?: QueryParams;
  headers?: Record<string, string>;
  /** 既定は `json`。本文がテキスト（ログアウト等）なら `text`、ファイルのダウンロードなら `blob`。 */
  responseType?: ApiResponseType;
  /** 呼び出し側でエラーを表示するときに true にし、共通のエラートーストを出さない（移植元 SKIP_GLOBAL_ERROR_TOAST）。 */
  skipGlobalErrorToast?: boolean;
  /** 401 でもセッションを破棄しない（移植元 SKIP_SESSION_INVALIDATION）。絶対URLへのリクエストは常に true 扱い。 */
  skipSessionInvalidation?: boolean;
  /** X-Tenant-ID を付けない。ローカルサーバへの SSE（移植元の fetch 直呼びは付けない。テナントは textData で渡す）用。 */
  omitTenantId?: boolean;
}

export interface ApiRequestOptionsWithBody extends ApiRequestOptions {
  body?: unknown;
}

/**
 * API がエラーを返したときに投げる。
 * message は `HTTP {status}`（画面側が message に含まれる status で分岐しているため形を変えない）。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly method: HttpMethod;
  readonly path: string;

  constructor(params: { status: number; body: unknown; method: HttpMethod; path: string }) {
    super(`HTTP ${params.status}`);
    this.name = 'ApiError';
    this.status = params.status;
    this.body = params.body;
    this.method = params.method;
    this.path = params.path;
  }
}

export interface ApiErrorContext {
  error: ApiError;
  skipGlobalErrorToast: boolean;
  skipSessionInvalidation: boolean;
}

export type ApiErrorHandler = (context: ApiErrorContext) => void;

// 移植元の errorInterceptor に相当する処理（トースト・401 でのセッション破棄）は、
// Router・i18n・トーストに依存するため api-client には持たせず、画面側から登録する（hooks/use-api-error-interceptor.ts）
let apiErrorHandler: ApiErrorHandler | null = null;

export function setApiErrorHandler(handler: ApiErrorHandler | null): void {
  apiErrorHandler = handler;
}

function isAbsoluteUrl(path: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(path);
}

// ベースURLが空（相対パス）でも URL を組み立てられるよう、配信元オリジンを基準にする。
// ベースURLが絶対URLのときは第2引数は無視されるため、ローカル開発の挙動は変わらない。
function buildUrl(path: string, params?: QueryParams): string {
  let baseUrl = API_BASE_URL;
  if (isAbsoluteUrl(path)) {
    baseUrl = '';
  } else if (path.startsWith(AUTH_API_PATH_PREFIX)) {
    baseUrl = AUTH_API_BASE_URL;
  }
  const url = new URL(`${baseUrl}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const values: readonly QueryValue[] = Array.isArray(value) ? value : [value as QueryValue];
      values.forEach((v) => url.searchParams.append(key, String(v)));
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

// FormData・Blob はブラウザに Content-Type（multipart の境界など）を決めさせるため、そのまま送る
function isRawBody(body: unknown): body is BodyInit {
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  );
}

function hasBody(body: unknown): boolean {
  return body !== undefined && body !== null;
}

function buildHeaders(
  body: unknown,
  customHeaders?: Record<string, string>,
  omitTenantId = false
): Record<string, string> {
  const tenantId = omitTenantId ? '' : resolveTenantId();
  return {
    ...(hasBody(body) && !isRawBody(body) && { 'Content-Type': 'application/json' }),
    // 移植元の authInterceptor と同じく、絶対URL（ローカルサーバ）を含む全リクエストに付ける
    ...(tenantId && { 'X-Tenant-ID': tenantId }),
    ...customHeaders,
  };
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (!hasBody(body)) return undefined;
  if (isRawBody(body)) return body;
  return JSON.stringify(body);
}

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function readBody<T>(res: Response, responseType: ApiResponseType): Promise<T> {
  if (responseType === 'text') return (await res.text()) as T;
  if (responseType === 'blob') return (await res.blob()) as T;
  // 204 や空の本文は Angular の HttpClient と同じく null を返す（DELETE などの戻り値で JSON パースに失敗させない）
  if (res.status === NO_CONTENT_STATUS) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function send(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptionsWithBody = {}
): Promise<Response> {
  const { params, headers, body } = options;
  return fetch(buildUrl(path, params), {
    credentials: 'include',
    ...toRequestInit(options),
    method,
    headers: buildHeaders(body, headers, options.omitTenantId),
    body: serializeBody(body),
  });
}

// api-client 独自のオプションは fetch に渡さない（signal・credentials など RequestInit の項目だけ渡す）
const CUSTOM_OPTION_KEYS = [
  'params',
  'headers',
  'body',
  'responseType',
  'skipGlobalErrorToast',
  'skipSessionInvalidation',
  'omitTenantId',
] as const;

function toRequestInit(options: ApiRequestOptionsWithBody): RequestInit {
  const init: Record<string, unknown> = { ...options };
  CUSTOM_OPTION_KEYS.forEach((key) => delete init[key]);
  return init as RequestInit;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptionsWithBody = {}
): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, options);
  } catch (e) {
    // 呼び出し側の中断（abort・AbortSignal.timeout）は通信エラーにせず、元の理由のまま投げる
    if (options.signal?.aborted) throw e;
    throw notifyError(
      new ApiError({ status: NETWORK_ERROR_STATUS, body: null, method, path }),
      path,
      options
    );
  }
  if (!res.ok) {
    const errorBody = await readErrorBody(res);
    throw notifyError(
      new ApiError({ status: res.status, body: errorBody, method, path }),
      path,
      options
    );
  }
  return readBody<T>(res, options.responseType ?? 'json');
}

function notifyError(error: ApiError, path: string, options: ApiRequestOptions): ApiError {
  apiErrorHandler?.({
    error,
    skipGlobalErrorToast: options.skipGlobalErrorToast ?? false,
    skipSessionInvalidation: (options.skipSessionInvalidation ?? false) || isAbsoluteUrl(path),
  });
  return error;
}

export const apiClient = {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return request<T>('GET', path, options);
  },

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>('POST', path, { ...options, body });
  },

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>('PUT', path, { ...options, body });
  },

  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return request<T>('PATCH', path, { ...options, body });
  },

  /** 一括削除など本文付きの DELETE は `options.body` で渡す（移植元と同じ）。 */
  delete<T>(path: string, options?: ApiRequestOptionsWithBody): Promise<T> {
    return request<T>('DELETE', path, options);
  },

  /**
   * SSE などで Response をそのまま読みたいときに使う（移植元 message-content-stream.service の fetch 直呼びに相当）。
   * ベースURL・X-Tenant-ID・credentials は他と同じく付けるが、本文は読まない。
   * 移植元の fetch 直呼びは errorInterceptor を通らないため、エラー時もトースト・セッション破棄はしない。
   */
  async stream(
    path: string,
    options: ApiRequestOptionsWithBody & { method?: HttpMethod } = {}
  ): Promise<Response> {
    const { method = 'POST', ...rest } = options;
    const res = await send(method, path, rest);
    if (!res.ok) {
      throw new ApiError({ status: res.status, body: await readErrorBody(res), method, path });
    }
    return res;
  },
};
