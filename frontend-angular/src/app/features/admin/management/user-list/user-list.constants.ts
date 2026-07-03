import type { UserFilter } from '@app-types/admin/user.types';

/** Default list query — no role/query so USER (and other) rows are included. */
export const INITIAL_USER_LIST_FILTER: UserFilter = {
  pageSize: 10,
  pageIndex: 1,
  sortField: 'name',
  sortOrder: 'asc',
};

export const USER_LIST_API_PATH = {
  LIST: '/admin/users',
  PROFILE: '/users/profile',
  IMPORT: '/admin/users/import',
} as const;
