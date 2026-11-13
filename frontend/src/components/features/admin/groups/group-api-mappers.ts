import type {
  GroupDetailApiItem,
  GroupMemberUserResponse,
} from '@/types/admin/group-management.types';
import type { AssistantApiItem } from '@/types/admin/assistant.types';
import type { TemplateApiItem } from '@/types/admin/template.types';
import type { UserApiItem, UserRoleUi } from '@/types/admin/user.types';
import type { PagedResponse } from '@/types/api-response.type';

// 移植元 group-list/utils/group-api.mappers.ts。グループ内の一覧・詳細の応答を画面用の形にする。

/** Spring の `Page` のうち読む項目 */
interface SpringPageRaw {
  content: unknown[];
  totalElements: number;
  number: number;
  size: number;
}

function isSpringPage(body: unknown): body is SpringPageRaw {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as SpringPageRaw).content) &&
    typeof (body as SpringPageRaw).totalElements === 'number'
  );
}

/** Spring の `Page` を画面用の形にする。ページの形でない応答は 0 件として扱う（移植元と同じ） */
export function parseSpringPage<T>(
  raw: unknown,
  mapItem: (item: unknown) => T,
): PagedResponse<T> {
  if (!isSpringPage(raw)) {
    return { content: [], totalElements: 0, number: 0, size: 0 };
  }
  return {
    content: raw.content.map(mapItem),
    totalElements: raw.totalElements,
    number: raw.number,
    size: raw.size,
  };
}

function normalizeTenantRole(role: string | undefined): UserRoleUi {
  if (role?.toUpperCase() === 'ADMIN') return 'admin';
  if (role?.toUpperCase() === 'SYSTEM') return 'system';
  return 'user';
}

/** グループ所属ユーザー 1 件（`GET /api/admin/groups/{id}/users`）を画面用の形にする */
export function mapGroupMemberUser(item: unknown): UserApiItem {
  const raw = item as GroupMemberUserResponse;
  const userId = raw.userId ?? '';
  const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : new Date(0);
  const totalCredits = raw.totalCredits != null ? Number(raw.totalCredits) : undefined;
  return {
    id: userId,
    userId,
    name: raw.name,
    displayName: raw.displayName ?? raw.name ?? userId,
    role: normalizeTenantRole(raw.role),
    groupAdmin: raw.groupAdmin ?? false,
    ...(totalCredits != null ? { totalCredits } : {}),
    usedTokens: raw.usedTokens ?? null,
    accountType: (raw.accountType as UserApiItem['accountType']) ?? 'none',
    email: raw.email ?? '',
    updatedAt,
  };
}

/** `GET/POST/PATCH /api/admin/groups/{id}` の応答を画面用の形にする */
export function mapGroupDetail(raw: unknown): GroupDetailApiItem {
  const body = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(body['id'] ?? ''),
    name: String(body['name'] ?? ''),
    tenantId: body['tenantId'] != null ? String(body['tenantId']) : undefined,
    updatedAt: body['updatedAt'] != null ? String(body['updatedAt']) : undefined,
  };
}

function toStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (value instanceof Set) return Array.from(value).map(String);
  return undefined;
}

/** グループ所属アシスタント 1 件（`GET /api/admin/groups/{id}/assistants`）を画面用の形にする */
export function mapGroupAssistantItem(item: unknown): AssistantApiItem {
  const raw = item as Record<string, unknown>;
  const categories = raw['categories'] as AssistantApiItem['categories'];
  const category =
    (raw['category'] as AssistantApiItem['category']) ??
    (Array.isArray(categories) && categories.length > 0 ? categories[0] : null);
  const assistantType = String(raw['assistantType'] ?? raw['type'] ?? '');
  const endpointsRaw = raw['endpoints'];
  const endpoints = Array.isArray(endpointsRaw)
    ? endpointsRaw.map((e) => {
        const ep = e as Record<string, unknown>;
        const nested = ep['tenantEndpoint'] as Record<string, unknown> | undefined;
        const label = String(ep['label'] ?? ep['endpointName'] ?? nested?.['endpointName'] ?? '');
        const model = String(ep['model'] ?? '');
        return {
          id: String(ep['id'] ?? nested?.['id'] ?? ''),
          label: label || model,
          model,
          url: String(ep['url'] ?? ep['endpoint'] ?? nested?.['endpoint'] ?? ''),
          type: String(ep['type'] ?? nested?.['type'] ?? ''),
        };
      })
    : [];

  return {
    id: String(raw['id'] ?? ''),
    name: String(raw['name'] ?? ''),
    description: String(raw['description'] ?? ''),
    type: assistantType,
    indexId: raw['indexId'] != null ? String(raw['indexId']) : undefined,
    includeHistory: Boolean(raw['includeHistory']),
    iconColor: String(raw['iconColor'] ?? ''),
    groups: toStringArray(raw['groups']) ?? [],
    category,
    categories,
    endpoints,
    addedAt: raw['addedAt'] != null ? String(raw['addedAt']) : undefined,
  };
}

/** グループ所属テンプレート 1 件（`GET /api/admin/groups/{id}/prompt-templates`）を画面用の形にする */
export function mapGroupTemplateItem(item: unknown): TemplateApiItem {
  const raw = item as Record<string, unknown>;
  return {
    id: String(raw['id'] ?? ''),
    tenantId: raw['tenantId'] != null ? String(raw['tenantId']) : undefined,
    name: String(raw['name'] ?? ''),
    description: String(raw['description'] ?? ''),
    systemPrompt: String(raw['systemPrompt'] ?? ''),
    groups: toStringArray(raw['groups']),
    createdAt: raw['createdAt'] != null ? String(raw['createdAt']) : undefined,
    updatedAt: raw['updatedAt'] != null ? String(raw['updatedAt']) : undefined,
    addedAt: raw['addedAt'] != null ? String(raw['addedAt']) : undefined,
  };
}
