/** Sentinel used by the role/permission filter on the users tab. */
export const ROLES = {
  ALL: 'all',
  ADMIN: 'admin',
  MEMBER: 'user',
  SYSTEM: 'system',
} as const;

export const GROUP_DETAIL_TAB_IDS = {
  USERS: 'users',
  TEMPLATES: 'templates',
  ASSISTANTS: 'assistants',
} as const;
