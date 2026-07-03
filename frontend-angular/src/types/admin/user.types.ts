/** API `UserResponse.role` (uppercase enum). */
export type UserApiRole = 'ADMIN' | 'USER' | 'SYSTEM';

/** Normalized role for UI / forms (lowercase). */
export type UserRoleUi = 'admin' | 'user' | 'system';

export interface AdminUser {
  id: string;
  userId: string;
  displayName: string;
  role: UserRoleUi;
  /** Billing-period credits from `GET /admin/users?includeUsage=true`. */
  totalCredits: number;
  loginKey: string;
  accountType: 'google' | 'microsoft' | 'none';
  email: string;
  updatedAt: Date;
}

export interface UserApiItem {
  id: string;
  userId: string;
  /** UI label; real API may return `name` only. */
  name?: string;
  displayName: string;
  /** Tenant-level role (`USER` / `ADMIN` / `SYSTEM` normalized to lowercase). */
  role: UserRoleUi;
  /** Group-scoped admin flag from `GET /admin/groups/{id}/users`. */
  groupAdmin?: boolean;
  /** Billing-period credits from `GET /admin/users?includeUsage=true`. */
  totalCredits?: number;
  /** Group member list only (`GET /admin/groups/{id}/users`). */
  usedTokens: number | null;
  loginKey: string;
  accountType: 'google' | 'microsoft' | 'none';
  email: string;
  updatedAt: Date;
}

export interface UserApiResponse {
  data: UserApiItem[];
  total: number;
  page: number;
  size: number;
}

/** POST /admin/users レスポンス */
export interface UserCreateApiResponse {
  id: string;
  loginId: string;
  name: string;
  displayName?: string;
  role: UserApiRole;
  loginKey: string;
  isRequiredPasswordReset: boolean;
  initialPassword: string;
  passwordExpiredAt: string;
}

/** PATCH /admin/users/{loginId} レスポンス */
export interface UserUpdateApiResponse {
  id: string;
  loginId: string;
  name: string;
  displayName?: string;
  role: UserApiRole;
  loginKey: string;
  isRequiredPasswordReset: boolean;
  initialPassword: string | null;
  passwordExpiredAt: string | null;
}

export type UserSortField = 'name' | 'role' | 'updatedAt' | 'totalCredits';
export type UserSortOrder = 'asc' | 'desc';

export interface UserFilter {
  query?: string;
  /** Optional UI filter; backend `getUsers` has no role param — applied in mock only / future API. */
  role?: UserRoleUi;
  /** Exclude users already assigned to this group (add-user picker). */
  excludeGroupId?: string;
  pageSize: number;
  pageIndex: number;
  sortField?: UserSortField;
  sortOrder?: UserSortOrder;
}
