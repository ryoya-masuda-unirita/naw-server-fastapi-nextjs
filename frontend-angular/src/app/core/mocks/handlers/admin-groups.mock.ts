import { MockRoute } from '../api-mock';
import {
  MOCK_GROUPS,
  MOCK_ADMIN_USERS,
  MOCK_ADMIN_ASSISTANTS,
  MOCK_TEMPLATES,
} from '../admin-mock-data';
import type { AdminUser } from '@app-types/admin/user.types';
import { API_PATHS } from '@app/core/constants/api-paths.config';
import { AssistantApiItem } from '@app-types/admin/assistant.types';

interface MockGroupRecord {
  id: string;
  tenantId: string;
  name: string;
  /** Member user ids (the API also distinguishes admins). */
  users: string[];
  adminUserIds: string[];
  assistants: string[];
  promptTemplates: string[];
  updatedAt: string;
}

/**
 * The original `MOCK_GROUPS` carries UI-only fields (`description`, `model`,
 * etc.) that don't match the API contract. We seed an enriched in-memory store
 * here that keeps the team-management screens happy without polluting the
 * shared mock data file.
 */
const MOCK_GROUP_ID_RECORDS: MockGroupRecord[] = (() => {
  const userIds = MOCK_ADMIN_USERS.map((u) => u.id);
  const assistantIds = MOCK_ADMIN_ASSISTANTS.map((a) => a.id);
  const templateIds = MOCK_TEMPLATES.map((t) => t.id);
  return MOCK_GROUPS.filter((g) => g.isActive).map((g) => ({
    id: g.id,
    tenantId: 'tenant-dev-001',
    name: g.name,
    // Spread membership across groups so the cards show different content.
    users: userIds.slice(0, 10),
    adminUserIds: userIds.slice(0, 5),
    assistants: assistantIds.slice(0, 10),
    promptTemplates: templateIds.slice(0, 10),
    updatedAt: isoDays(g.updatedAt ?? g.createdAt),
  }));
})();

const MOCK_GROUP_RECORDS: MockGroupRecord[] = (() => {
  const users = MOCK_ADMIN_USERS.map((u) => u.displayName);
  const assistants = MOCK_ADMIN_ASSISTANTS.map((a) => a.name);
  const templates = MOCK_TEMPLATES.map((t) => t.name);
  return MOCK_GROUPS.filter((g) => g.isActive).map((g) => ({
    id: g.id,
    tenantId: 'tenant-dev-001',
    name: g.name,
    // Spread membership across groups so the cards show different content.
    users: users.slice(0, 10),
    adminUserIds: users.slice(0, 5),
    assistants: assistants.slice(0, 10),
    promptTemplates: templates.slice(0, 10),
    updatedAt: isoDays(g.updatedAt ?? g.createdAt),
  }));
})();

function isoDays(d: Date | string | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 19);
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 19);
}

interface GroupWriteBody {
  name?: string;
  users?: string[];
  adminUserIds?: string[];
  assistants?: string[];
  promptTemplates?: string[];
}

function parseBody(body: unknown): GroupWriteBody {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as GroupWriteBody;
    } catch {
      return {};
    }
  }
  return body as GroupWriteBody;
}

function nextId(): string {
  const max = MOCK_GROUP_ID_RECORDS.reduce((m, g) => {
    const n = parseInt(g.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

function isoNow(): string {
  return new Date().toISOString().slice(0, 19);
}

function getSessionUser(): {
  id?: string;
  name?: string;
  role?: string;
  groups?: { groupId: string; groupAdmin: boolean }[];
} | null {
  try {
    const userJson = sessionStorage.getItem('user');
    return userJson ? (JSON.parse(userJson) as ReturnType<typeof getSessionUser>) : null;
  } catch {
    return null;
  }
}

function getAdminGroupIdsForSession(): Set<string> | null {
  const user = getSessionUser();
  if (!user || user.role?.toUpperCase() === 'ADMIN') {
    return null;
  }
  return new Set(
    (user.groups ?? []).filter((group) => group.groupAdmin).map((group) => group.groupId),
  );
}

function filterGroupsForSessionUser(rows: MockGroupRecord[]): MockGroupRecord[] {
  const adminGroupIds = getAdminGroupIdsForSession();
  if (!adminGroupIds) {
    return rows;
  }
  if (adminGroupIds.size === 0) {
    return [];
  }
  return rows.filter((group) => adminGroupIds.has(group.id));
}

function canAccessGroup(groupId: string): boolean {
  const adminGroupIds = getAdminGroupIdsForSession();
  if (!adminGroupIds) {
    return true;
  }
  return adminGroupIds.has(groupId);
}

function appendSessionUserToMemberRows(
  groupId: string,
  rows: GroupMemberUserRow[],
  includeUsage: boolean,
): GroupMemberUserRow[] {
  const sessionUser = getSessionUser();
  if (!sessionUser?.id) return rows;

  const isGroupAdmin = (sessionUser.groups ?? []).some(
    (group) => group.groupId === groupId && group.groupAdmin,
  );
  if (!isGroupAdmin) return rows;

  if (rows.some((row) => row.userId === sessionUser.id)) {
    return rows.map((row) => (row.userId === sessionUser.id ? { ...row, groupAdmin: true } : row));
  }

  const sessionRow: GroupMemberUserRow = {
    userId: sessionUser.id,
    name: sessionUser.name ?? sessionUser.id,
    displayName: null,
    role: 'USER',
    loginKey: '',
    accountType: null,
    email: null,
    groupAdmin: true,
    updatedAt: isoNow(),
  };
  if (includeUsage) {
    sessionRow.totalCredits = 0;
  }
  return [sessionRow, ...rows];
}

// ─── Route matchers ───────────────────────────────────────────────────────────
const groupMatch = /\/admin\/groups$/;
const allGroupsMatch = /\/admin\/all-groups$/;
const groupDetailMatch = /\/admin\/groups\/[0-9]+$/;
const groupUsersMatch = /\/admin\/groups\/[^/]+\/users$/;
const groupUserDetailMatch = /\/admin\/groups\/[^/]+\/users\/[^/]+$/;
const groupAssistantsMatch = /\/admin\/groups\/[^/]+\/assistants$/;
const groupAssistantDetailMatch = /\/admin\/groups\/[^/]+\/assistants\/[^/]+$/;
const groupTemplatesMatch = /\/admin\/groups\/[^/]+\/prompt-templates$/;
const groupTemplateDetailMatch = /\/admin\/groups\/[^/]+\/prompt-templates\/[^/]+$/;

export const adminGroupsMockRoutes: MockRoute[] = [
  // ─── Tenant-wide list (used by assistant create/edit team selector) ─────
  {
    method: 'GET',
    match: allGroupsMatch,
    handler: (_url, _body, params) => {
      const q = (params['q'] ?? '').toLowerCase();
      const rows = q
        ? MOCK_GROUP_RECORDS.filter((g) => g.name.toLowerCase().includes(q))
        : MOCK_GROUP_RECORDS;
      const data = rows.map((g) => ({ id: g.id, name: g.name }));
      return [200, { data, total: data.length }];
    },
  },
  // ─── Slim list (used by template-form combobox) ─────────────
  {
    method: 'GET',
    match: groupMatch,
    handler: (_url, _body, params) => {
      // The template-form combobox calls without paging params and just wants
      // `{ data: [{id,name}] }`. The team-list cards page passes `page/size`
      // and expects the paginated shape. We shape based on the presence of
      // `size` to keep both consumers happy with one route.
      const isPaged = params['size'] !== undefined;
      const q = (params['q'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      let rows = filterGroupsForSessionUser([...MOCK_GROUP_RECORDS]);
      if (q) rows = rows.filter((g) => g.name.toLowerCase().includes(q));
      rows.sort((a, b) => {
        const aV = sortField === 'name' ? a.name : (a.updatedAt ?? '');
        const bV = sortField === 'name' ? b.name : (b.updatedAt ?? '');
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      if (!isPaged) {
        const data = rows.map((g) => ({ id: g.id, name: g.name }));
        return [200, { data, total: data.length }];
      }

      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '5', 10);
      const start = page * size;
      const data = rows.slice(start, start + size).map((g) => ({
        id: g.id,
        name: g.name,
        users: g.users,
        adminUserIds: g.adminUserIds,
        assistants: g.assistants,
        promptTemplates: g.promptTemplates,
        updatedAt: g.updatedAt,
      }));
      return [200, { data, total: rows.length, page, size }];
    },
  },
  {
    method: 'POST',
    match: groupMatch,
    handler: (_url, body) => {
      if (getAdminGroupIdsForSession() !== null) {
        return [403, { message: 'forbidden' }];
      }
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      if (!name) return [400, { message: 'name is required' }];
      const updatedAt = isoNow();
      const created: MockGroupRecord = {
        id: nextId(),
        tenantId: 'tenant-dev-001',
        name,
        users: [],
        adminUserIds: [],
        assistants: [],
        promptTemplates: [],
        updatedAt,
      };
      MOCK_GROUP_ID_RECORDS.unshift(created);
      return [200, toGroupDetailResponse(created)];
    },
  },
  {
    method: 'PATCH',
    match: groupDetailMatch,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === id);
      if (idx === -1) return [404, { message: 'group not found' }];
      const existing = MOCK_GROUP_ID_RECORDS[idx];
      const b = parseBody(body);
      const next: MockGroupRecord = {
        ...existing,
        name: b.name !== undefined && b.name !== null ? b.name.trim() : existing.name,
        updatedAt: isoNow(),
      };
      MOCK_GROUP_ID_RECORDS[idx] = next;
      return [200, toGroupDetailResponse(next)];
    },
  },
  {
    method: 'DELETE',
    match: groupDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === id);
      if (idx === -1) return [404, { message: 'group not found' }];
      MOCK_GROUP_ID_RECORDS.splice(idx, 1);
      return [200, { id }];
    },
  },

  // ─── Slim option lists used by the team form ──────────────
  {
    method: 'GET',
    match: new RegExp(`^${API_PATHS.ADMIN.USERS.LIST}$`),
    handler: () => {
      return [200, { data: MOCK_ADMIN_USERS, total: MOCK_ADMIN_USERS.length }];
    },
  },
  {
    method: 'GET',
    match: new RegExp(`^${API_PATHS.ADMIN.ASSISTANTS.LIST}$`),
    handler: () => {
      return [200, { data: MOCK_ADMIN_ASSISTANTS, total: MOCK_ADMIN_ASSISTANTS.length }];
    },
  },
  {
    method: 'GET',
    match: new RegExp(`^${API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST}$`),
    handler: () => {
      return [200, { data: MOCK_TEMPLATES, total: MOCK_TEMPLATES.length }];
    },
  },

  {
    method: 'GET',
    match: groupDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const group = MOCK_GROUP_ID_RECORDS.find((g) => g.id === id);
      if (!group) return [404, { message: 'group not found' }];
      return [200, toGroupDetailResponse(group)];
    },
  },
  {
    method: 'GET',
    match: groupUsersMatch,
    handler: (url, _body, params) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const group = MOCK_GROUP_ID_RECORDS.find((g) => g.id === id);
      if (!group) return [404, { message: 'group not found' }];

      const q = (params['searchText'] ?? '').toLowerCase();
      const role = params['role'];
      const includeUsage = params['includeUsage'] === 'true';
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      const adminSet = new Set(group.adminUserIds);
      const memberIds = Array.from(new Set([...group.users, ...group.adminUserIds]));
      const memberRows = memberIds
        .map((uid) => {
          const u = MOCK_ADMIN_USERS.find((x) => x.id === uid);
          if (!u) return null;
          return toGroupMemberUserRow(u, adminSet.has(uid), includeUsage);
        })
        .filter((r): r is GroupMemberUserRow => r !== null);

      let rows = appendSessionUserToMemberRows(id, memberRows, includeUsage);
      if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      if (role === 'ADMIN') rows = rows.filter((r) => r.groupAdmin);
      if (role === 'USER') rows = rows.filter((r) => !r.groupAdmin);
      rows.sort((a, b) => {
        const aV = pickMemberSortValue(a, sortField);
        const bV = pickMemberSortValue(b, sortField);
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '25', 10);
      const start = page * size;
      const content = rows.slice(start, start + size);
      return [200, springPage(content, rows.length, page, size)];
    },
  },
  {
    method: 'POST',
    match: groupUsersMatch,
    handler: (url, body) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === id);
      if (idx === -1) return [404, { message: 'group not found' }];
      const b = parseBody(body) as { userIds?: string[] };
      const userIds = b.userIds ?? [];
      if (userIds.length === 0) return [400, { message: 'userIds required' }];
      const existing = new Set(MOCK_GROUP_ID_RECORDS[idx].users);
      userIds.forEach((uid) => existing.add(uid));
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...MOCK_GROUP_ID_RECORDS[idx],
        users: Array.from(existing),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
  {
    method: 'DELETE',
    match: groupUserDetailMatch,
    handler: (url) => {
      const parts = url.split('/');
      const userId = parts[parts.length - 1] ?? '';
      const groupId = parts[parts.length - 3] ?? '';
      if (!canAccessGroup(groupId)) return [403, { message: 'forbidden' }];
      const sessionUser = getSessionUser();
      if (sessionUser?.id === userId) {
        return [403, { message: 'cannot remove self' }];
      }
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === groupId);
      if (idx === -1) return [404, { message: 'group not found' }];
      const group = MOCK_GROUP_ID_RECORDS[idx];
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...group,
        users: group.users.filter((id) => id !== userId),
        adminUserIds: group.adminUserIds.filter((id) => id !== userId),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
  {
    method: 'PATCH',
    match: groupUserDetailMatch,
    handler: (url, body) => {
      const parts = url.split('/');
      const userId = parts[parts.length - 1] ?? '';
      const groupId = parts[parts.length - 3] ?? '';
      if (!canAccessGroup(groupId)) return [403, { message: 'forbidden' }];
      const sessionUser = getSessionUser();
      const b = parseBody(body) as { groupAdmin?: boolean };
      if (sessionUser?.id === userId && b.groupAdmin === false) {
        return [403, { message: 'cannot demote self' }];
      }
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === groupId);
      if (idx === -1) return [404, { message: 'group not found' }];
      const group = MOCK_GROUP_ID_RECORDS[idx];
      const isSessionMember = sessionUser?.id === userId;
      if (
        !isSessionMember &&
        !group.users.includes(userId) &&
        !group.adminUserIds.includes(userId)
      ) {
        return [404, { message: 'user not in group' }];
      }
      const adminSet = new Set(group.adminUserIds);
      if (b.groupAdmin === true) {
        adminSet.add(userId);
        const users = group.users.includes(userId) ? group.users : [...group.users, userId];
        MOCK_GROUP_ID_RECORDS[idx] = {
          ...group,
          users,
          adminUserIds: Array.from(adminSet),
          updatedAt: isoNow(),
        };
      } else {
        adminSet.delete(userId);
        MOCK_GROUP_ID_RECORDS[idx] = {
          ...group,
          adminUserIds: Array.from(adminSet),
          updatedAt: isoNow(),
        };
      }
      return [204, null];
    },
  },
  {
    method: 'GET',
    match: groupAssistantsMatch,
    handler: (url, _body, params) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const group = MOCK_GROUP_ID_RECORDS.find((g) => g.id === id);
      if (!group) return [404, { error: 'Group not found' }];

      const assistantRows = group.assistants
        .map((aid) => {
          const a = MOCK_ADMIN_ASSISTANTS.find((x) => x.id === aid);
          if (!a) return null;
          return { ...a, addedAt: group.updatedAt };
        })
        .filter((r): r is AssistantApiItem & { addedAt: string } => r !== null);

      const type = params['type'];
      const categoryId = params['categoryId'];
      const search = (params['search'] ?? '').toLowerCase();

      let rows = [...assistantRows];
      if (type) rows = rows.filter((r) => r.type === type);
      if (categoryId) {
        rows = rows.filter((r) =>
          (r.categories ?? (r.category ? [r.category] : [])).some(
            (category) => category.id === categoryId,
          ),
        );
      }
      if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search));

      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '25', 10);
      const start = page * size;
      const content = rows.slice(start, start + size);
      return [200, springPage(content, rows.length, page, size)];
    },
  },
  {
    method: 'POST',
    match: groupAssistantsMatch,
    handler: (url, body) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === id);
      if (idx === -1) return [404, { message: 'group not found' }];
      const b = parseBody(body) as { assistantIds?: string[] };
      const assistantIds = b.assistantIds ?? [];
      if (assistantIds.length === 0) return [400, { message: 'assistantIds required' }];
      const existing = new Set(MOCK_GROUP_ID_RECORDS[idx].assistants);
      assistantIds.forEach((aid) => existing.add(aid));
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...MOCK_GROUP_ID_RECORDS[idx],
        assistants: Array.from(existing),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
  {
    method: 'DELETE',
    match: groupAssistantDetailMatch,
    handler: (url) => {
      const parts = url.split('/');
      const assistantId = parts[parts.length - 1] ?? '';
      const groupId = parts[parts.length - 3] ?? '';
      if (!canAccessGroup(groupId)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === groupId);
      if (idx === -1) return [404, { message: 'group not found' }];
      const group = MOCK_GROUP_ID_RECORDS[idx];
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...group,
        assistants: group.assistants.filter((id) => id !== assistantId),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
  {
    method: 'GET',
    match: groupTemplatesMatch,
    handler: (url, _body, params) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const group = MOCK_GROUP_ID_RECORDS.find((g) => g.id === id);
      if (!group) return [404, { error: 'Group not found' }];

      const templateRows = group.promptTemplates
        .map((tid) => {
          const t = MOCK_TEMPLATES.find((x) => x.id === tid);
          if (!t) return null;
          return toGroupTemplateRow(t, id);
        })
        .filter((r): r is GroupTemplateRow => r !== null);

      const search = (params['search'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'addedAt,desc').split(',');

      let rows = [...templateRows];
      if (search) {
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(search) || r.description.toLowerCase().includes(search),
        );
      }

      rows.sort((a, b) => {
        const av = pickTemplateSortValue(a, sortField);
        const bv = pickTemplateSortValue(b, sortField);
        const cmp =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '25', 10);
      const start = page * size;
      const content = rows.slice(start, start + size);
      return [200, springPage(content, rows.length, page, size)];
    },
  },
  {
    method: 'POST',
    match: groupTemplatesMatch,
    handler: (url, body) => {
      const parts = url.split('/');
      const id = parts[parts.length - 2] ?? '';
      if (!canAccessGroup(id)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === id);
      if (idx === -1) return [404, { message: 'group not found' }];
      const b = parseBody(body) as { templateIds?: string[] };
      const templateIds = b.templateIds ?? [];
      if (templateIds.length === 0) return [400, { message: 'templateIds required' }];
      const existing = new Set(MOCK_GROUP_ID_RECORDS[idx].promptTemplates);
      templateIds.forEach((tid) => existing.add(tid));
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...MOCK_GROUP_ID_RECORDS[idx],
        promptTemplates: Array.from(existing),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
  {
    method: 'DELETE',
    match: groupTemplateDetailMatch,
    handler: (url) => {
      const parts = url.split('/');
      const templateId = parts[parts.length - 1] ?? '';
      const groupId = parts[parts.length - 3] ?? '';
      if (!canAccessGroup(groupId)) return [403, { message: 'forbidden' }];
      const idx = MOCK_GROUP_ID_RECORDS.findIndex((g) => g.id === groupId);
      if (idx === -1) return [404, { message: 'group not found' }];
      const group = MOCK_GROUP_ID_RECORDS[idx];
      MOCK_GROUP_ID_RECORDS[idx] = {
        ...group,
        promptTemplates: group.promptTemplates.filter((id) => id !== templateId),
        updatedAt: isoNow(),
      };
      return [204, null];
    },
  },
];

interface GroupMemberUserRow {
  userId: string;
  name: string;
  displayName: null;
  role: string;
  totalCredits?: number;
  loginKey: string;
  accountType: null;
  email: null;
  groupAdmin: boolean;
  updatedAt: string;
}

function toGroupDetailResponse(group: MockGroupRecord) {
  return {
    id: group.id,
    tenantId: group.tenantId,
    name: group.name,
    updatedAt: group.updatedAt,
  };
}

function springPage<T>(content: T[], total: number, page: number, size: number) {
  return {
    content,
    totalElements: total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(size, 1))),
    size,
    number: page,
    first: page === 0,
    last: (page + 1) * size >= total,
    empty: content.length === 0,
    numberOfElements: content.length,
  };
}

function toGroupMemberUserRow(
  user: AdminUser,
  isAdmin: boolean,
  includeUsage: boolean,
): GroupMemberUserRow {
  const tenantRole = user.role === 'admin' ? 'ADMIN' : user.role === 'system' ? 'SYSTEM' : 'USER';
  const row: GroupMemberUserRow = {
    userId: user.id,
    name: user.displayName,
    displayName: null,
    role: tenantRole,
    loginKey: user.loginKey ?? '',
    accountType: null,
    email: null,
    groupAdmin: isAdmin,
    updatedAt: new Date().toISOString(),
  };
  if (includeUsage) {
    row.totalCredits = user.totalCredits;
  }
  return row;
}

function pickMemberSortValue(row: GroupMemberUserRow, field: string): string | number {
  if (field === 'name') return row.name;
  if (field === 'role') return row.groupAdmin ? 1 : 0;
  return row.updatedAt;
}

// ─── Assistant helpers ────────────────────────────────────────────────────

// interface GroupAssistantRow {
//   id: string;
//   name: string;
//   description: string;
//   serverType: string;
//   serverCode: string;
//   model: string;
//   category: string;
//   termDictionaries: string;
//   historyEnabled: boolean;
//   addedAt: string;
// }

// ─── Template helpers ─────────────────────────────────────────────────────

interface GroupTemplateRow {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  addedAt: string;
}

function toGroupTemplateRow(
  template: (typeof MOCK_TEMPLATES)[number],
  groupId: string,
): GroupTemplateRow {
  const seed = parseInt(template.id, 10) || 0;
  const days = (seed * 3 + parseInt(groupId, 10) * 4) % 60;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    systemPrompt: template.systemPrompt,
    addedAt: date.toISOString().slice(0, 19),
  };
}

function pickTemplateSortValue(row: GroupTemplateRow, field: string): string {
  if (field === 'name') return row.name;
  return row.addedAt;
}
