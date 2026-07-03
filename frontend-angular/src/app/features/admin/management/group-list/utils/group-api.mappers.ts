import type { PagedResponse } from '@app-types/api-response.type';
import type {
  GroupDetailApiItem,
  GroupMemberUserResponse,
} from '@app-types/admin/group-management.types';
import type { UserApiItem, UserRoleUi } from '@app-types/admin/user.types';
import type { AssistantApiItem } from '@app-types/admin/assistant.types';
import type { TemplateApiItem } from '@app-types/admin/template.types';

interface SpringPageRaw {
  content: unknown[];
  totalElements: number;
  number: number;
  size: number;
}

export function isSpringPage(body: unknown): body is SpringPageRaw {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as SpringPageRaw).content) &&
    typeof (body as SpringPageRaw).totalElements === 'number'
  );
}

export function parseSpringPage<T>(raw: unknown, mapItem: (item: unknown) => T): PagedResponse<T> {
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
    loginKey: raw.loginKey ?? '',
    accountType: (raw.accountType as UserApiItem['accountType']) ?? 'none',
    email: raw.email ?? '',
    updatedAt,
  };
}

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
  } as AssistantApiItem & { addedAt?: string };
}

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
  } as TemplateApiItem & { addedAt?: string };
}
