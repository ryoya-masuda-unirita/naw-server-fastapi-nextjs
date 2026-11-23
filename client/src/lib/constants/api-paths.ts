/**
 * API パスの定数（移植元 `core/constants/api-paths.config.ts` に相当）。
 * 画面・hooks・MSW のハンドラーはパス文字列を直書きせず、ここを使う。
 *
 * 移植元との違い:
 * - 移植元は baseUrlInterceptor が `/api` を前置するため値に `/api` を含まないが、
 *   React の api-client はパスをそのままベース URL に連結するため、値に `/api` を含める。
 *   `/auth/...`（ログイン系）は移植元と同じく `/api` を付けない（api-client が認証 API 用のベース URL を使う）。
 * - 移植元で画面ごとに持っていたパス定数（TEMPLATE_LIST_API_PATH・ASSISTANT_LIST_API_PATH・
 *   TRAINING_DATA_API_PATH・USER_LIST_API_PATH）も、画面ごとに足さなくて済むようここへまとめる。
 */

const API_PREFIX = '/api';

export const API_PATHS = {
  // ─── Auth ────────────────────────────────────────────────
  AUTH: {
    LOGIN: '/auth/login',
    LOGIN_KEY: '/auth/login-key',
    LOGOUT: '/auth/logout',
    PASSWORD_RESET: '/auth/password/reset',
    SESSION: `${API_PREFIX}/auth`,
  },

  // ─── Rooms (Sidebar / Chat) ───────────────────────────────
  ROOMS: {
    DEFAULT: `${API_PREFIX}/rooms`,
    LIST: `${API_PREFIX}/rooms`,
    CREATE: `${API_PREFIX}/rooms`,
    REORDER: `${API_PREFIX}/rooms/reorder`,
    BULK_PIN_UPDATE: `${API_PREFIX}/rooms/pin`,
    DETAIL: (roomId: string) => `${API_PREFIX}/rooms/${roomId}`,
    RENAME: (roomId: string) => `${API_PREFIX}/rooms/${roomId}`,
    PIN: (roomId: string) => `${API_PREFIX}/rooms/${roomId}/pin`,
    UNPIN: (roomId: string) => `${API_PREFIX}/rooms/${roomId}/pin`,
    FEEDBACK: (roomId: string) => `${API_PREFIX}/rooms/${roomId}/feedback`,
  },

  // ─── Assistants ───────────────────────────────────────────
  ASSISTANTS: {
    LIST: `${API_PREFIX}/assistants`,
  },

  // ─── Prompt Templates (Chat) ──────────────────────────────
  PROMPT_TEMPLATES: {
    LIST: `${API_PREFIX}/prompt-templates`,
  },

  // ─── Messages ────────────────────────────────────────────
  MESSAGES: {
    LIST: `${API_PREFIX}/messages`,
    CREATE: `${API_PREFIX}/messages`,
    CONTENT: `${API_PREFIX}/messages/content`,
    CONTENTS: `${API_PREFIX}/messages/contents`,
    CONTENT_DETAIL: (id: string) => `${API_PREFIX}/messages/contents/${id}`,
    DETAIL: (id: string) => `${API_PREFIX}/messages/${id}`,
    FEEDBACK: (messageId: string) => `${API_PREFIX}/messages/${messageId}/feedback`,
  },

  // ─── Groups ───────────────────────────────────────────────
  GROUPS: {
    LIST: `${API_PREFIX}/groups`,
  },

  // ─── Shares ───────────────────────────────────────────────
  SHARES: {
    CREATE: `${API_PREFIX}/shares`,
    DELETE: (shareId: string) => `${API_PREFIX}/shares/${shareId}`,
    ACCESS: (shareId: string) => `${API_PREFIX}/shares/${shareId}/access`,
  },

  // ─── Users ───────────────────────────────────────────────
  USERS: {
    PROFILE: `${API_PREFIX}/users/profile`,
  },

  // ─── Token / Credit Usage ─────────────────────────────────
  TOKEN_USAGES: {
    GET: `${API_PREFIX}/token-usages`,
  },
  CREDIT_USAGE: {
    ME: `${API_PREFIX}/credit-usage/me`,
    WORKSPACE: `${API_PREFIX}/credit-usage/workspace`,
  },
  ADMIN_TOKEN_USAGES: {
    LIST: `${API_PREFIX}/admin/token-usages`,
    SUMMARY: `${API_PREFIX}/admin/token-usages/summary`,
  },

  // ─── Tags ─────────────────────────────────────────────────
  TAGS: {
    LIST: `${API_PREFIX}/tags`,
    CREATE: `${API_PREFIX}/tags`,
    UPDATE: (id: string) => `${API_PREFIX}/tags/${id}`,
    DELETE: (id: string) => `${API_PREFIX}/tags/${id}`,
    DETAIL: (id: string) => `${API_PREFIX}/tags/${id}`,
  },

  // ─── Admin: Library Tags ──────────────────────────────────
  ADMIN_LIBRARY_TAGS: {
    LIST: `${API_PREFIX}/admin/library-tags`,
    CREATE: `${API_PREFIX}/admin/library-tags`,
    UPDATE: (id: string) => `${API_PREFIX}/admin/library-tags/${id}`,
    DELETE: `${API_PREFIX}/admin/library-tags`,
  },

  // ─── Library ──────────────────────────────────────────────
  LIBRARY: {
    LIST: `${API_PREFIX}/libraries`,
    CREATE: `${API_PREFIX}/libraries`,
    DETAIL: (id: string) => `${API_PREFIX}/libraries/${id}`,
    DETAIL_LIST: (id: string) => `${API_PREFIX}/libraries/${id}/list`,
  },

  // ─── Libraries (Chat viewer) ──────────────────────────────
  LIBRARIES: {
    TAGS: `${API_PREFIX}/libraries/tags`,
    UPDATE: (libraryId: string) => `${API_PREFIX}/libraries/${libraryId}`,
  },

  // ─── Viewer ───────────────────────────────────────────────
  VIEWER: {
    DETAIL_LIST: (roomId: string) => `${API_PREFIX}/libraries/${roomId}/list`,
    CONTENT: (libraryId: string) => `${API_PREFIX}/libraries/${libraryId}/content`,
  },

  // ─── Admin: Glossary ──────────────────────────────────────
  GLOSSARY: {
    TERMS: `${API_PREFIX}/admin/glossary/terms`,
    TAGS: `${API_PREFIX}/admin/glossary/tags`,
    TAG_DETAIL: (id: string) => `${API_PREFIX}/admin/glossary/tags/${id}`,
    /** Rows inside a dictionary (term-word-admin). */
    DICTIONARY_WORDS: (glossaryId: string) =>
      `${API_PREFIX}/admin/glossary/terms/${glossaryId}/words`,
    DICTIONARY_WORDS_BULK_DELETE: (glossaryId: string) =>
      `${API_PREFIX}/admin/glossary/terms/${glossaryId}/words/bulk-delete`,
    DICTIONARY_WORD: (glossaryId: string, wordId: string) =>
      `${API_PREFIX}/admin/glossary/terms/${glossaryId}/words/${wordId}`,
    /** Assistants linked to a dictionary (term-word-assistant-admin). */
    DICTIONARY_ASSISTANTS: (glossaryId: string) =>
      `${API_PREFIX}/admin/glossary/terms/${glossaryId}/assistants`,
    DICTIONARY_ASSISTANTS_BULK_DELETE: (glossaryId: string) =>
      `${API_PREFIX}/admin/glossary/terms/${glossaryId}/assistants/bulk-delete`,
  },

  // ─── Admin: Training Data (Indexes) ────────────────────────
  INDEXES: {
    LIST: `${API_PREFIX}/admin/indexes`,
    CREATE: `${API_PREFIX}/admin/indexes`,
    DETAIL: (id: string) => `${API_PREFIX}/admin/indexes/${id}`,
    SYNC: (id: string) => `${API_PREFIX}/admin/indexes/${id}/sync`,
    FILES: (id: string) => `${API_PREFIX}/admin/indexes/${id}/files`,
    FILES_BULK_DELETE: (id: string) => `${API_PREFIX}/admin/indexes/${id}/files/bulk-delete`,
    FILE: (id: string, fileId: string) => `${API_PREFIX}/admin/indexes/${id}/files/${fileId}`,
    ADDITIONAL_LEARNING: (indexId: string) =>
      `${API_PREFIX}/admin/indexes/${indexId}/additionalLearning`,
  },

  // ─── User: Glossary ───────────────────────────────────────
  USER_GLOSSARY: {
    TERMS: `${API_PREFIX}/user/glossary/terms`,
    TERM_DETAIL: (id: string) => `${API_PREFIX}/user/glossary/terms/${id}`,
    DICTIONARY_WORDS: (glossaryId: string) =>
      `${API_PREFIX}/user/glossary/terms/${glossaryId}/words`,
    DICTIONARY_WORDS_BULK_DELETE: (glossaryId: string) =>
      `${API_PREFIX}/user/glossary/terms/${glossaryId}/words/bulk-delete`,
    DICTIONARY_WORD: (glossaryId: string, wordId: string) =>
      `${API_PREFIX}/user/glossary/terms/${glossaryId}/words/${wordId}`,
    DICTIONARY_ASSISTANTS: (glossaryId: string) =>
      `${API_PREFIX}/user/glossary/terms/${glossaryId}/assistants`,
    DICTIONARY_ASSISTANTS_BULK_DELETE: (glossaryId: string) =>
      `${API_PREFIX}/user/glossary/terms/${glossaryId}/assistants/bulk-delete`,
  },

  ADMIN: {
    GROUPS: {
      LIST: `${API_PREFIX}/admin/groups`,
      DETAIL: (id: string) => `${API_PREFIX}/admin/groups/${id}`,
      USERS: (groupId: string) => `${API_PREFIX}/admin/groups/${groupId}/users`,
      USER_DETAIL: (groupId: string, userId: string) =>
        `${API_PREFIX}/admin/groups/${groupId}/users/${userId}`,
      ASSISTANTS: (groupId: string) => `${API_PREFIX}/admin/groups/${groupId}/assistants`,
      ASSISTANT_DETAIL: (groupId: string, assistantId: string) =>
        `${API_PREFIX}/admin/groups/${groupId}/assistants/${assistantId}`,
      TEMPLATES: (groupId: string) => `${API_PREFIX}/admin/groups/${groupId}/prompt-templates`,
      TEMPLATE_DETAIL: (groupId: string, templateId: string) =>
        `${API_PREFIX}/admin/groups/${groupId}/prompt-templates/${templateId}`,
    },
    /** 選択肢用の全グループ（移植元 ASSISTANT_LIST_API_PATH.OPTIONS_GROUPS） */
    ALL_GROUPS: {
      LIST: `${API_PREFIX}/admin/all-groups`,
    },
    USERS: {
      LIST: `${API_PREFIX}/admin/users`,
      // 移植元（user-list-api.service）は loginId を encodeURIComponent してからパスに入れる
      DETAIL: (loginId: string) => `${API_PREFIX}/admin/users/${encodeURIComponent(loginId)}`,
      IMPORT: `${API_PREFIX}/admin/users/import`,
    },
    ASSISTANTS: {
      LIST: `${API_PREFIX}/admin/assistants`,
      DETAIL: (id: string) => `${API_PREFIX}/admin/assistants/${id}`,
      SERVER_OPTIONS: `${API_PREFIX}/admin/assistants/server-options`,
      API_OPTIONS: `${API_PREFIX}/admin/assistants/api-options`,
      MODEL_OPTIONS: `${API_PREFIX}/admin/assistants/model-options`,
      ENDPOINTS_BY_TYPE: (type: string) => `${API_PREFIX}/admin/assistants/endpoints/${type}`,
      AI_MODELS: `${API_PREFIX}/admin/assistants/AIModels`,
      DICTIONARY_OPTIONS: `${API_PREFIX}/admin/assistants/dictionary-options`,
    },
    ASSISTANT_CATEGORIES: {
      LIST: `${API_PREFIX}/admin/assistant-categories`,
      DETAIL: (id: string) => `${API_PREFIX}/admin/assistant-categories/${id}`,
      OPTIONS: `${API_PREFIX}/admin/assistant-categories/options`,
    },
    PROMPT_TEMPLATES: {
      LIST: `${API_PREFIX}/admin/prompt-templates`,
      DETAIL: (id: string) => `${API_PREFIX}/admin/prompt-templates/${id}`,
    },
    TENANTS: {
      GET: `${API_PREFIX}/admin/tenants`,
      UPDATE: (tenantId: string) => `${API_PREFIX}/admin/tenants/${tenantId}`,
      UPDATE_USAGE_LIMIT: (tenantId: string) =>
        `${API_PREFIX}/admin/tenants/${tenantId}/usage-limit`,
      ENDPOINTS: (tenantId: string) => `${API_PREFIX}/admin/tenants/${tenantId}/endpoints`,
      ENDPOINT: (tenantId: string, endpointId: string) =>
        `${API_PREFIX}/admin/tenants/${tenantId}/endpoints/${endpointId}`,
      /** 学習データ画面のエンドポイント選択肢（移植元 TRAINING_DATA_API_PATH.ENDPOINTS_BY_TYPE） */
      ENDPOINTS_BY_TYPE: (type: string) => `${API_PREFIX}/admin/tenants/endpoints/${type}`,
    },
    HISTORIES: {
      LIST: `${API_PREFIX}/admin/histories`,
    },
    FEEDBACK_USERS: {
      LIST: `${API_PREFIX}/admin/feedbackUser`,
    },
    FEEDBACK_MESSAGES: {
      LIST: `${API_PREFIX}/admin/feedbackMessage`,
    },
    FEEDBACK_ROOMS: {
      LIST: `${API_PREFIX}/admin/feedbackRoom`,
    },
    LEARNING_FOLDERS: {
      LIST: `${API_PREFIX}/admin/learning-folders`,
    },
    LIBRARY: {
      LIST: `${API_PREFIX}/libraries`,
      UPDATE: (id: string) => `${API_PREFIX}/libraries/${id}`,
      DELETE: (id: string) => `${API_PREFIX}/libraries/${id}`,
    },
  },
} as const;
