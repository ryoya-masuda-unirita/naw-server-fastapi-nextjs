export const ROUTE_SEGMENTS = {
  AUTH: 'auth',
  ADMIN: 'admin',
  USER: 'user',
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
  LEARNING_DATA: 'learning-data',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  LIBRARY: 'library',
  LIBRARY_DETAIL: 'library/:id',
  DATA_SOURCE: 'data-source',
  GLOSSARY: 'glossary',
  /** Glossary dictionary detail: `/glossary/:glossaryId/...` */
  GLOSSARY_DICTIONARY: 'glossary/:glossaryId',
  GLOSSARY_TERM_WORDS: 'glossary/:glossaryId/term-words',
  GLOSSARY_ASSISTANTS: 'glossary/:glossaryId/assistants',
  ADMIN_CONSOLE_HOME: 'management',
  ADMIN_TENANT: 'tenant',
  ADMIN_USERS: 'users',
  ADMIN_GROUPS: 'groups',
  ADMIN_ASSISTANTS: 'assistants',
  ADMIN_CHAT_HISTORY: 'chat-history',
  ADMIN_CHAT_HISTORY_DETAIL: 'chat-history/:roomId',
  ADMIN_TRAINING_DATA: 'training-data',
  ADMIN_TRAINING_DATA_DETAIL: 'training-data/:id',
  ADMIN_FEEDBACK: 'feedback',
  ADMIN_TEMPLATES: 'templates',
  CHAT_NEW: 'chat/new',
  CHAT_ASSISTANT: 'chat/assistant',
  CHAT_SEARCH: 'chat/search',
  CHAT_ROOM: 'chat/:roomId',
  CHAT_MEDICAL: 'chat/medical',
  CHAT_INVENTORY: 'chat/inventory',
  CHAT_RECRUITMENT: 'chat/recruitment',
  CHAT_SECUAIGENT: 'chat/secuaigent',
  CHAT_HISTORY: 'chat-history',
  CHAT_SHARED_HISTORY: 'chat-shared-history/:roomId',
  FEEDBACK_PREVIEW: 'feedback-preview/:roomId',
} as const;

export const CHAT_PATHS = {
  NEW: APP_PATHS.CHAT_NEW,
  ROOM: ':id',
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
    LEARNING_DATA: `/${APP_PATHS.LEARNING_DATA}`,
    REPORTS: `/${APP_PATHS.REPORTS}`,
    SETTINGS: `/${APP_PATHS.SETTINGS}`,
    LIBRARY: `/${APP_PATHS.LIBRARY}`,
    LIBRARY_DETAIL: (id: string) => `/library/${id}`,
    DATA_SOURCE: '#',
    GLOSSARY: `/${APP_PATHS.GLOSSARY}`,
    GLOSSARY_TERM_WORDS: (glossaryId: string) => `/glossary/${glossaryId}/term-words`,
    GLOSSARY_ASSISTANTS: (glossaryId: string) => `/glossary/${glossaryId}/assistants`,
    ADMIN_CONSOLE_HOME: `${ADMIN_BASE}/${APP_PATHS.ADMIN_CONSOLE_HOME}`,
    ADMIN_TENANT: `${ADMIN_BASE}/${APP_PATHS.ADMIN_TENANT}`,
    ADMIN_USERS: `${ADMIN_BASE}/${APP_PATHS.ADMIN_USERS}`,
    ADMIN_GROUPS: `${ADMIN_BASE}/${APP_PATHS.ADMIN_GROUPS}`,
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
    CHAT_SEARCH: '#',
    CHAT_ROOM: (roomId: string) => `/chat/${roomId}`,
    CHAT_MEDICAL: `/${APP_PATHS.CHAT_MEDICAL}`,
    CHAT_INVENTORY: `/${APP_PATHS.CHAT_INVENTORY}`,
    CHAT_RECRUITMENT: `/${APP_PATHS.CHAT_RECRUITMENT}`,
    CHAT_SECUAIGENT: `/${APP_PATHS.CHAT_SECUAIGENT}`,
    CHAT_HISTORY: `/${APP_PATHS.CHAT_HISTORY}`,
  },
} as const;
