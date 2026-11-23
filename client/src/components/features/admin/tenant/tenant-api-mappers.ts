import type { Endpoint, TenantInfo } from '@/types/admin/tenant.types';
import type { ApiResponse } from '@/types/api-response.type';
import type {
  TokenUsageListItem,
  TokenUsageListResponse,
  TokenUsageSummaryResponse,
} from '@/types/token-usage.type';

// 移植元 tenant/services/tenant-api.mappers.ts。backend の応答の形の揺れ（`{ success, data }` の包み・配列・`contents`）を吸収する

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `{ success, data }` なら中身を取り出し、包まれていなければそのまま返す */
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

/** 画面の並べ替え項目 → API の `orderBy` */
const USAGE_SORT_FIELD_TO_ORDER_BY: Record<string, string> = {
  updated: 'createdAt',
  amount: 'totalTokens',
  name: 'userId',
};

type TokenUsageListParams = Record<string, string | number | boolean>;

/** 画面の並べ替えと 1 始まりのページを、管理者用トークン利用一覧のクエリにする */
export function buildTokenUsageListParams(options: {
  from: string;
  to: string;
  userId: string;
  page: number;
  size: number;
  sortField: string | null;
  sortOrder: string | null;
}): TokenUsageListParams {
  const orderBy =
    (options.sortField && USAGE_SORT_FIELD_TO_ORDER_BY[options.sortField]) ||
    options.sortField ||
    'createdAt';
  const reverse = options.sortOrder !== 'asc';

  const params: TokenUsageListParams = {
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

/** `GET /admin/tenants/{tenantId}/endpoints` の応答を平らな配列にする */
export function mapEndpointList(body: unknown): Endpoint[] {
  const raw = Array.isArray(body) ? body : unwrapApiData<unknown>(body);

  if (Array.isArray(raw)) {
    return raw as Endpoint[];
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

  return items as Endpoint[];
}

/** `{ message, data }` の包みと `ApiResponse<Endpoint>` の両方を受ける */
export function mapEndpoint(body: unknown): Endpoint {
  if (!isRecord(body)) {
    throw new Error('Invalid API response');
  }
  if (isRecord(body['data']) && 'id' in body['data']) {
    return body['data'] as unknown as Endpoint;
  }
  return unwrapApiData<Endpoint>(body);
}
