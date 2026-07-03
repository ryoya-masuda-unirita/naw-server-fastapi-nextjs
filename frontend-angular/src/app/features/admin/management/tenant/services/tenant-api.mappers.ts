import type { Endpoint, EndpointListResponse, TenantInfo } from '@app-types/admin/tenant.types';
import type { ApiResponse } from '@app-types/api-response.type';
import type {
  TokenUsageListItem,
  TokenUsageListResponse,
  TokenUsageSummaryResponse,
} from '@app-types/token-usage.type';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Unwraps `{ success, data }` or returns body as-is when already unwrapped. */
export function unwrapApiData<T>(body: unknown): T {
  if (!isRecord(body)) {
    throw new Error('Invalid API response');
  }
  if ('success' in body) {
    const wrapped = body as unknown as ApiResponse<T>;
    if (!wrapped.success || wrapped.data === undefined) {
      throw new Error(wrapped.error ?? 'Request failed');
    }
    return wrapped.data;
  }
  return body as T;
}

export function mapTenantInfo(body: unknown): TenantInfo {
  return unwrapApiData<TenantInfo>(body);
}

export function mapTokenUsageSummary(body: unknown): TokenUsageSummaryResponse {
  return unwrapApiData<TokenUsageSummaryResponse>(body);
}

function mapTokenUsageListItem(item: Record<string, unknown>): TokenUsageListItem {
  const userIdRaw = item['userId'] ?? item['user_id'];
  return {
    id: String(item['id']),
    userId: userIdRaw != null ? String(userIdRaw) : null,
    messageId: item['messageId'] != null ? String(item['messageId']) : null,
    model: item['model'] != null ? String(item['model']) : null,
    inputTokens: Number(item['inputTokens'] ?? 0),
    outputTokens: Number(item['outputTokens'] ?? 0),
    embeddingTokens: Number(item['embeddingTokens'] ?? 0),
    totalTokens: Number(item['totalTokens'] ?? 0),
    inputCredits: Number(item['inputCredits'] ?? 0),
    outputCredits: Number(item['outputCredits'] ?? 0),
    embeddingCredits: Number(item['embeddingCredits'] ?? 0),
    totalCredits: Number(item['totalCredits'] ?? 0),
    createdAt: String(item['createdAt'] ?? ''),
  };
}

export function mapTokenUsageList(body: unknown): TokenUsageListResponse {
  const raw = unwrapApiData<unknown>(body);
  if (!isRecord(raw)) {
    throw new Error('Invalid token usage list response');
  }
  const contentsRaw = raw['contents'];
  if (!Array.isArray(contentsRaw)) {
    throw new Error('Invalid token usage list response');
  }
  return {
    contents: contentsRaw.map((item) => mapTokenUsageListItem(item as Record<string, unknown>)),
    totalCount: Number(raw['totalCount'] ?? 0),
    hasNext: Boolean(raw['hasNext']),
  };
}

const USAGE_SORT_FIELD_TO_ORDER_BY: Record<string, string> = {
  updated: 'createdAt',
  amount: 'totalTokens',
  name: 'userId',
};

/** Maps UI sort + 1-based page to admin token-usage list query params. */
export function buildTokenUsageListParams(options: {
  from: string;
  to: string;
  userId: string;
  page: number;
  size: number;
  sortField: string | null;
  sortOrder: string | null;
}): Record<string, string | number | boolean> {
  const orderBy =
    (options.sortField && USAGE_SORT_FIELD_TO_ORDER_BY[options.sortField]) ||
    options.sortField ||
    'createdAt';
  const reverse = options.sortOrder !== 'asc';

  const params: Record<string, string | number | boolean> = {
    from: options.from,
    to: options.to,
    page: Math.max(0, options.page - 1),
    size: options.size,
    orderBy,
    reverse,
  };

  if (options.userId) {
    params['userId'] = options.userId;
  }

  return params;
}

const ENDPOINT_SORT_FIELD_TO_ORDER_BY: Record<string, string> = {
  updated: 'updatedAt',
  name: 'endpointName',
  port: 'type',
};

/** Maps UI sort + 1-based page to tenant endpoints list query params. */
export function buildEndpointListParams(options: {
  page: number;
  size: number;
  sortField: string | null;
  sortOrder: string | null;
}): Record<string, string | number | boolean> {
  const orderBy =
    (options.sortField && ENDPOINT_SORT_FIELD_TO_ORDER_BY[options.sortField]) ||
    options.sortField ||
    'updatedAt';
  const reverse = options.sortOrder !== 'asc';

  return {
    page: Math.max(0, options.page - 1),
    size: options.size,
    orderBy,
    reverse,
  };
}

/** Maps `GET /admin/tenants/{tenantId}/endpoints` responses to UI list shape. */
export function mapEndpointList(
  body: unknown,
  uiPage: number,
  uiSize: number,
): EndpointListResponse {
  const raw = Array.isArray(body) ? body : unwrapApiData<unknown>(body);

  if (Array.isArray(raw)) {
    return {
      data: raw as Endpoint[],
      total: raw.length,
      page: uiPage,
      pageSize: uiSize,
    };
  }

  if (!isRecord(raw)) {
    throw new Error('Invalid endpoint list response');
  }

  const items =
    (Array.isArray(raw['contents']) ? raw['contents'] : null) ??
    (Array.isArray(raw['content']) ? raw['content'] : null) ??
    (Array.isArray(raw['data']) ? raw['data'] : null);

  if (!items) {
    throw new Error('Invalid endpoint list response');
  }

  const total =
    typeof raw['totalCount'] === 'number'
      ? raw['totalCount']
      : typeof raw['totalElements'] === 'number'
        ? raw['totalElements']
        : typeof raw['total'] === 'number'
          ? raw['total']
          : items.length;

  const apiPage = typeof raw['page'] === 'number' ? raw['page'] : null;
  const page = apiPage !== null && apiPage >= 0 && apiPage < uiPage ? apiPage + 1 : uiPage;

  return {
    data: items as Endpoint[],
    total,
    page,
    pageSize: typeof raw['pageSize'] === 'number' ? raw['pageSize'] : uiSize,
  };
}

/** Supports `{ message, data }` mutation envelopes and `ApiResponse<Endpoint>`. */
export function mapEndpoint(body: unknown): Endpoint {
  if (!isRecord(body)) {
    throw new Error('Invalid API response');
  }
  if (isRecord(body['data']) && 'id' in body['data']) {
    return body['data'] as unknown as Endpoint;
  }
  return unwrapApiData<Endpoint>(body);
}
