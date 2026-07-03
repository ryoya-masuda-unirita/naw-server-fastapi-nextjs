import { AssistantApiItem } from './assistant.types';

/**
 * View-model rendered by the team/group cards page (Astro: management-team.astro).
 * Names follow the Japanese UI: 管理者 / 所属ユーザー / 所属アシスタント / 所属テンプレート.
 */
export interface GroupListItem {
  id: string;
  name: string;
  /** Display names of group admins. */
  adminUserNames: string[];
  /** Display names of member users. */
  userNames: string[];
  /** Display names of assigned assistants. */
  assistants: string[];
  /** Display names of assigned templates. */
  templates: string[];
  /** ISO `YYYY-MM-DDTHH:mm:ss`. */
  updatedAt?: string;
}

/** Server contract — `/api/admin/groups` response item. */
export interface GroupApiItem {
  id: string;
  tenantId?: string;
  name: string;
  /** User ids (admin or regular). */
  users?: string[];
  adminUserIds?: string[];
  /** Display names of group admins. */
  adminUserNames?: string[];
  /** Display names of member users. */
  userNames?: string[];
  /** Display names of assigned assistants. */
  assistants?: string[];
  /** Assistant IDs for PATCH payloads. */
  assistantIds?: string[];
  /** Display names of assigned templates. */
  promptTemplates?: string[];
  /** Template IDs for PATCH payloads. */
  promptTemplateIds?: string[];
  updatedAt?: string;
}

export interface GroupApiResponse {
  data: GroupApiItem[];
  total: number;
  page: number;
  size: number;
}

export type GroupSortField = 'updatedAt' | 'name';
export type GroupSortOrder = 'asc' | 'desc';

export interface GroupListFilter {
  query?: string;
  pageSize: number;
  pageIndex: number;
  sortField?: GroupSortField;
  sortOrder?: GroupSortOrder;
}

/** Shape passed to POST/PATCH `/api/admin/groups` (name only). */
export interface GroupNamePayload {
  name: string;
}

/**
 * @deprecated Membership is managed via child-resource APIs. Kept for legacy references.
 */
export interface GroupWritePayload {
  name: string;
  adminUserIds: string[];
  users: string[];
  assistants: string[];
  promptTemplates: string[];
}

/** Server contract — `GET/POST/PATCH /api/admin/groups/{id}` (`GroupDetailResponse`). */
export interface GroupDetailApiItem {
  id: string;
  name: string;
  tenantId?: string;
  updatedAt?: string;
}

/** Server contract — `GET /api/admin/groups/{groupId}/users` item. */
export interface GroupMemberUserResponse {
  userId: string;
  name: string;
  displayName: string | null;
  role: string;
  totalCredits?: number;
  usedTokens?: number | null;
  loginKey: string;
  accountType: string | null;
  email: string | null;
  groupAdmin: boolean;
  updatedAt: string;
}

/** A user's role within a group. */
export type GroupUserRole = 'admin' | 'user';

// ─── Group Assistants ───────────────────────────────────────────────────────

export type GroupAssistantSortField = 'addedAt' | 'name' | 'server' | 'category';

export interface GroupAssistantListFilter {
  /** `SECURE` | `SAAS_CHAT` | `SAAS_RAG` */
  type?: string;
  /** Category ID filter. */
  categoryId?: string;
  search?: string;
  excludeGroupId?: string;
  pageSize: number;
  pageIndex: number;
  sortField?: GroupAssistantSortField;
  sortOrder?: GroupSortOrder;
}

export interface GroupAssistantItem extends Omit<AssistantApiItem, 'includeHistory'> {
  historyLabel: string;
  serverLabel: string;
  endpointLabel: string;
}

// ─── Group Templates ────────────────────────────────────────────────────────

/** View-model rendered by the 所属テンプレート table. */
export interface GroupTemplateItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  addedAt?: string;
}

/** Server contract — paginated template-list under `/api/admin/groups/{id}/templates`. */

export type GroupTemplateSortField = 'addedAt' | 'name';

export interface GroupTemplateListFilter {
  search?: string;
  excludeGroupId?: string;
  pageSize: number;
  pageIndex: number;
  sortField?: GroupTemplateSortField;
  sortOrder?: GroupSortOrder;
}

export type GroupMemberUserSortField = 'updatedAt' | 'name' | 'role';

export interface GroupMemberUserFilter {
  query?: string;
  /** Group-scoped role filter: `ADMIN` or `USER`. */
  role?: 'ADMIN' | 'USER';
  pageSize: number;
  pageIndex: number;
  sortField?: GroupMemberUserSortField;
  sortOrder?: GroupSortOrder;
}
