export const CHAT_ASSISTANT_TYPE = {
  SECURE: 'SECURE',
  SAAS_CHAT: 'SAAS_CHAT',
  SAAS_RAG: 'SAAS_RAG',
} as const;

export type ChatAssistantType = (typeof CHAT_ASSISTANT_TYPE)[keyof typeof CHAT_ASSISTANT_TYPE];
