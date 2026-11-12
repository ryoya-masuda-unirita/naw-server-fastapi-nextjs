/**
 * Centralized API path definitions.
 * Use these constants in services and mock handlers instead of hardcoding strings.
 */

export const API_PATHS = {
  // ─── Auth ────────────────────────────────────────────────
  AUTH: {
    LOGIN: '/auth/login',
    LOGIN_KEY: '/auth/login-key',
    LOGOUT: '/auth/logout',
    PASSWORD_RESET: '/auth/password/reset',
    SESSION: '/auth',
  },

  // ─── Rooms (Sidebar / Chat) ───────────────────────────────
  ROOMS: {
    DEFAULT: '/rooms',
    LIST: '/rooms',
    CREATE: '/rooms',
    REORDER: '/rooms/reorder',
    BULK_PIN_UPDATE: '/rooms/pin',
    DETAIL: (roomId: string) => `/rooms/${roomId}`,
    RENAME: (roomId: string) => `/rooms/${roomId}`,
    PIN: (roomId: string) => `/rooms/${roomId}/pin`,
    UNPIN: (roomId: string) => `/rooms/${roomId}/pin`,
    FEEDBACK: (roomId: string) => `/rooms/${roomId}/feedback`,
  },

  // ─── Assistants ───────────────────────────────────────────
  ASSISTANTS: {
    LIST: '/assistants',
  },

  // ─── Prompt Templates (Chat) ──────────────────────────────
  PROMPT_TEMPLATES: {
    LIST: '/prompt-templates',
  },

  // ─── Messages ────────────────────────────────────────────
  MESSAGES: {
    LIST: '/messages',
    CREATE: '/messages',
    CONTENT: '/messages/content',
    CONTENTS: '/messages/contents',
    CONTENT_DETAIL: (id: string) => `/messages/contents/${id}`,
    DETAIL: (id: string) => `/messages/${id}`,
    FEEDBACK: (messageId: string) => `/messages/${messageId}/feedback`,
  },

  // ─── Groups ───────────────────────────────────────────────
  GROUPS: {
    LIST: '/groups',
  },

  // ─── Shares ───────────────────────────────────────────────
  SHARES: {
    CREATE: '/shares',
    DELETE: (shareId: string) => `/shares/${shareId}`,
    ACCESS: (shareId: string) => `/shares/${shareId}/access`,
  },

  // ─── Users ───────────────────────────────────────────────
  USERS: {
    PROFILE: '/users/profile',
  },

  // ─── Token / Credit Usage ─────────────────────────────────
  TOKEN_USAGES: {
    GET: '/token-usages',
  },
  CREDIT_USAGE: {
    ME: '/credit-usage/me',
    WORKSPACE: '/credit-usage/workspace',
  },
  ADMIN_TOKEN_USAGES: {
    LIST: '/admin/token-usages',
    SUMMARY: '/admin/token-usages/summary',
  },

  // ─── Tags ─────────────────────────────────────────────────
  TAGS: {
    LIST: '/tags',
    CREATE: '/tags',
    UPDATE: (id: string) => `/tags/${id}`,
    DELETE: (id: string) => `/tags/${id}`,
    DETAIL: (id: string) => `/tags/${id}`,
  },

  // ─── Admin: Library Tags ──────────────────────────────────
  ADMIN_LIBRARY_TAGS: {
    LIST: '/admin/library-tags',
    CREATE: '/admin/library-tags',
    UPDATE: (id: string) => `/admin/library-tags/${id}`,
    DELETE: '/admin/library-tags',
  },

  // ─── Library ──────────────────────────────────────────────
  LIBRARY: {
    LIST: '/libraries',
    CREATE: '/libraries',
    DETAIL: (id: string) => `/libraries/${id}`,
    DETAIL_LIST: (id: string) => `/libraries/${id}/list`,
  },

  // ─── Libraries (Chat viewer) ──────────────────────────────
  LIBRARIES: {
    TAGS: '/libraries/tags',
    UPDATE: (libraryId: string) => `/libraries/${libraryId}`,
  },

  // ─── Viewer ───────────────────────────────────────────────
  VIEWER: {
    DETAIL_LIST: (roomId: string) => `/libraries/${roomId}/list`,
    CONTENT: (libraryId: string) => `/libraries/${libraryId}`,
  },

  // ─── Admin: Glossary ──────────────────────────────────────
  GLOSSARY: {
    TERMS: '/admin/glossary/terms',
    TAGS: '/admin/glossary/tags',
    TAG_DETAIL: (id: string) => `/admin/glossary/tags/${id}`,
    /** Rows inside a dictionary (term-word-admin). */
    DICTIONARY_WORDS: (glossaryId: string) => `/admin/glossary/terms/${glossaryId}/words`,
    DICTIONARY_WORDS_BULK_DELETE: (glossaryId: string) =>
      `/admin/glossary/terms/${glossaryId}/words/bulk-delete`,
    DICTIONARY_WORD: (glossaryId: string, wordId: string) =>
      `/admin/glossary/terms/${glossaryId}/words/${wordId}`,
    /** Assistants linked to a dictionary (term-word-assistant-admin). */
    DICTIONARY_ASSISTANTS: (glossaryId: string) => `/admin/glossary/terms/${glossaryId}/assistants`,
    DICTIONARY_ASSISTANTS_BULK_DELETE: (glossaryId: string) =>
      `/admin/glossary/terms/${glossaryId}/assistants/bulk-delete`,
  },
  // ─── Admin: Training Data (Indexes) ────────────────────────
  INDEXES: {
    LIST: '/admin/indexes',
    CREATE: '/admin/indexes',
    DETAIL: (id: string) => `/admin/indexes/${id}`,
    SYNC: (id: string) => `/admin/indexes/${id}/sync`,
    FILES: (id: string) => `/admin/indexes/${id}/files`,
    FILES_BULK_DELETE: (id: string) => `/admin/indexes/${id}/files/bulk-delete`,
    FILE: (id: string, fileId: string) => `/admin/indexes/${id}/files/${fileId}`,
    ADDITIONAL_LEARNING: (indexId: string) => `/admin/indexes/${indexId}/additionalLearning`,
  },
  // ─── User: Glossary ───────────────────────────────────────
  USER_GLOSSARY: {
    TERMS: '/user/glossary/terms',
    TERM_DETAIL: (id: string) => `/user/glossary/terms/${id}`,
    DICTIONARY_WORDS: (glossaryId: string) => `/user/glossary/terms/${glossaryId}/words`,
    DICTIONARY_WORDS_BULK_DELETE: (glossaryId: string) =>
      `/user/glossary/terms/${glossaryId}/words/bulk-delete`,
    DICTIONARY_WORD: (glossaryId: string, wordId: string) =>
      `/user/glossary/terms/${glossaryId}/words/${wordId}`,
    DICTIONARY_ASSISTANTS: (glossaryId: string) => `/user/glossary/terms/${glossaryId}/assistants`,
    DICTIONARY_ASSISTANTS_BULK_DELETE: (glossaryId: string) =>
      `/user/glossary/terms/${glossaryId}/assistants/bulk-delete`,
  },
  ADMIN: {
    GROUPS: {
      LIST: '/admin/groups',
      DETAIL: (id: string) => `/admin/groups/${id}`,
      USERS: (groupId: string) => `/admin/groups/${groupId}/users`,
      USER_DETAIL: (groupId: string, userId: string) => `/admin/groups/${groupId}/users/${userId}`,
      ASSISTANTS: (groupId: string) => `/admin/groups/${groupId}/assistants`,
      ASSISTANT_DETAIL: (groupId: string, assistantId: string) =>
        `/admin/groups/${groupId}/assistants/${assistantId}`,
      TEMPLATES: (groupId: string) => `/admin/groups/${groupId}/prompt-templates`,
      TEMPLATE_DETAIL: (groupId: string, templateId: string) =>
        `/admin/groups/${groupId}/prompt-templates/${templateId}`,
    },
    USERS: {
      LIST: '/admin/users',
    },
    ASSISTANTS: {
      LIST: '/admin/assistants',
    },
    PROMPT_TEMPLATES: {
      LIST: '/admin/prompt-templates',
    },
    TENANTS: {
      GET: '/admin/tenants',
      UPDATE: (tenantId: string) => `/admin/tenants/${tenantId}`,
      UPDATE_USAGE_LIMIT: (tenantId: string) => `/admin/tenants/${tenantId}/usage-limit`,
      ENDPOINTS: (tenantId: string) => `/admin/tenants/${tenantId}/endpoints`,
      ENDPOINT: (tenantId: string, endpointId: string) =>
        `/admin/tenants/${tenantId}/endpoints/${endpointId}`,
    },
    HISTORIES: {
      LIST: '/admin/histories',
    },
    FEEDBACK_USERS: {
      LIST: '/admin/feedbackUser',
    },
    FEEDBACK_MESSAGES: {
      LIST: '/admin/feedbackMessage',
    },
    FEEDBACK_ROOMS: {
      LIST: '/admin/feedbackRoom',
    },
    LEARNING_FOLDERS: {
      LIST: '/admin/learning-folders',
    },
    LIBRARY: {
      LIST: '/libraries',
      UPDATE: (id: string) => `/libraries/${id}`,
      DELETE: (id: string) => `/libraries/${id}`,
    },
  },
} as const;
