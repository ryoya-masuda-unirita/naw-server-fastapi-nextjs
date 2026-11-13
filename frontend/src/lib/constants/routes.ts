// 移植元 core/constants/routes.config.ts と同じ名前・同じ値にする。
// 用語集（GLOSSARY*）・データソース（DATA_SOURCE）は移植元で非表示にした機能のため持たない（docs/issue-277）。
// 移植元で使われていない定数（CHAT_MEDICAL 等）も持たない。

export const ROUTE_SEGMENTS = {
  AUTH: 'auth',
  ADMIN: 'admin',
  CHAT: 'chat',
} as const;

export const AUTH_PATHS = {
  ROOT: ROUTE_SEGMENTS.AUTH,
  LOGIN: 'login',
  PW_RESET: 'password/reset',
} as const;

export const APP_PATHS = {
  DASHBOARD: 'dashboard',
  USERS: 'users',
  USERS_NEW: 'users/new',
  USERS_DETAIL: 'users/:id',
  USERS_EDIT: 'users/:id/edit',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  LIBRARY: 'library',
  LIBRARY_DETAIL: 'library/:id',
  ADMIN_CONSOLE_HOME: 'management',
  ADMIN_TENANT: 'tenant',
  ADMIN_USERS: 'users',
  ADMIN_GROUPS: 'groups',
  ADMIN_GROUP_DETAIL: 'groups/:id',
  ADMIN_GROUP_MEMBERS: 'groups/:id/members',
  ADMIN_ASSISTANTS: 'assistants',
  ADMIN_CHAT_HISTORY: 'chat-history',
  ADMIN_CHAT_HISTORY_DETAIL: 'chat-history/:roomId',
  ADMIN_TRAINING_DATA: 'training-data',
  ADMIN_TRAINING_DATA_DETAIL: 'training-data/:id',
  ADMIN_FEEDBACK: 'feedback',
  ADMIN_TEMPLATES: 'templates',
  CHAT_NEW: 'chat/new',
  CHAT_ASSISTANT: 'chat/assistant',
  CHAT_ROOM: 'chat/:roomId',
  CHAT_VIEWER: 'viewer/:chatId',
  CHAT_SHARE: 'share/:shareId',
  CHAT_SHARED_HISTORY: 'chat-shared-history/:roomId',
  FEEDBACK_PREVIEW: 'feedback-preview/:roomId',
} as const;

// グループ詳細のタブ（移植元 admin.routes.ts の子ルート）
export const GROUP_DETAIL_TABS = {
  USERS: 'users',
  TEMPLATES: 'templates',
  ASSISTANTS: 'assistants',
} as const;

const ADMIN_BASE = `/${ROUTE_SEGMENTS.ADMIN}`;

export const ROUTES = {
  AUTH: {
    ROOT: `/${ROUTE_SEGMENTS.AUTH}`,
    LOGIN: `/${ROUTE_SEGMENTS.AUTH}/${AUTH_PATHS.LOGIN}`,
    PW_RESET: `/${ROUTE_SEGMENTS.AUTH}/${AUTH_PATHS.PW_RESET}`,
  },
  APP: {
    ROOT: '/',
    DASHBOARD: `/${APP_PATHS.DASHBOARD}`,
    USERS: `/${APP_PATHS.USERS}`,
    USERS_NEW: `/${APP_PATHS.USERS_NEW}`,
    USERS_DETAIL: (id: string) => `/users/${id}`,
    USERS_EDIT: (id: string) => `/users/${id}/edit`,
    REPORTS: `/${APP_PATHS.REPORTS}`,
    SETTINGS: `/${APP_PATHS.SETTINGS}`,
    LIBRARY: `/${APP_PATHS.LIBRARY}`,
    LIBRARY_DETAIL: (id: string) => `/library/${id}`,
    ADMIN_CONSOLE_HOME: `${ADMIN_BASE}/${APP_PATHS.ADMIN_CONSOLE_HOME}`,
    ADMIN_TENANT: `${ADMIN_BASE}/${APP_PATHS.ADMIN_TENANT}`,
    ADMIN_USERS: `${ADMIN_BASE}/${APP_PATHS.ADMIN_USERS}`,
    ADMIN_GROUPS: `${ADMIN_BASE}/${APP_PATHS.ADMIN_GROUPS}`,
    ADMIN_GROUP_DETAIL: (id: string) => `${ADMIN_BASE}/${APP_PATHS.ADMIN_GROUPS}/${id}`,
    ADMIN_GROUP_DETAIL_TAB: (
      id: string,
      tab: (typeof GROUP_DETAIL_TABS)[keyof typeof GROUP_DETAIL_TABS]
    ) => `${ADMIN_BASE}/${APP_PATHS.ADMIN_GROUPS}/${id}/${tab}`,
    ADMIN_GROUP_MEMBERS: (id: string) => `${ADMIN_BASE}/${APP_PATHS.ADMIN_GROUPS}/${id}/members`,
    ADMIN_ASSISTANTS: `${ADMIN_BASE}/${APP_PATHS.ADMIN_ASSISTANTS}`,
    ADMIN_CHAT_HISTORY: `${ADMIN_BASE}/${APP_PATHS.ADMIN_CHAT_HISTORY}`,
    ADMIN_CHAT_HISTORY_DETAIL: (roomId: string) =>
      `${ADMIN_BASE}/${APP_PATHS.ADMIN_CHAT_HISTORY}/${roomId}`,
    ADMIN_TRAINING_DATA: `${ADMIN_BASE}/${APP_PATHS.ADMIN_TRAINING_DATA}`,
    ADMIN_TRAINING_DATA_DETAIL: (id: string) =>
      `${ADMIN_BASE}/${APP_PATHS.ADMIN_TRAINING_DATA}/${id}`,
    ADMIN_FEEDBACK: `${ADMIN_BASE}/${APP_PATHS.ADMIN_FEEDBACK}`,
    ADMIN_TEMPLATES: `${ADMIN_BASE}/${APP_PATHS.ADMIN_TEMPLATES}`,
    CHAT_NEW: `/${APP_PATHS.CHAT_NEW}`,
    CHAT_ASSISTANT: `/${APP_PATHS.CHAT_ASSISTANT}`,
    // 移植元でも '#'。サイドバーでは遷移せず検索モーダルを開くボタンになる
    CHAT_SEARCH: '#',
    CHAT_ROOM: (roomId: string) => `/chat/${roomId}`,
    CHAT_VIEWER: (chatId: string) => `/chat/viewer/${chatId}`,
    CHAT_SHARE: (shareId: string) => `/chat/share/${shareId}`,
    CHAT_SHARED_HISTORY: (roomId: string) => `/chat-shared-history/${roomId}`,
    FEEDBACK_PREVIEW: (roomId: string) => `/feedback-preview/${roomId}`,
  },
} as const;
