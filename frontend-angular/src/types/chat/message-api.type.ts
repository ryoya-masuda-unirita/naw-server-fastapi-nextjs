import { ResponseStatus } from '@app-types/common';
import { FileAttachment } from './file-attachment.type';
import { Message, ReferenceFilePaths } from './message.type';

/** GET /api/messages?roomId= — message metadata item */
export interface MessageListApiItem {
  id: string;
  roomId: string;
  assistantId: string;
  parentId: string | null;
  isRated: boolean;
  /** チャット送信時に使用した tools（編集・再生成で再利用） */
  tools?: MessageContentToolItem[] | null;
  /** チャット送信時に適用したプロンプトテンプレート本文（編集・再生成で再利用） */
  promptTemplateContent?: string | null;
  /** ライブラリ生成を行ったか（編集・再生成で再利用） */
  isCreateLibrary?: boolean;
}

/** GET /api/messages?roomId= — assistant endpoint metadata */
export interface MessageListAssistantEndpoint {
  type: string;
  destination: string;
  apiKey: string;
}

/** GET /api/messages?roomId= — assistant metadata */
export interface MessageListAssistant {
  id: string;
  type: string;
  endpoints: MessageListAssistantEndpoint[];
}

/** GET /api/messages?roomId= */
export interface MessagesListApiResponse {
  assistants?: MessageListAssistant[];
  messages: MessageListApiItem[];
}

/** POST /api/messages — create response (wire: message id string, or legacy wrapped object) */
export type CreateMessageApiResponse = string | { data?: { id?: string }; id?: string };

/** Normalizes POST /messages create response to a message id. */
export function parseCreateMessageId(response: CreateMessageApiResponse): string {
  if (typeof response === 'string') {
    const trimmed = response.trim();
    if (!trimmed) {
      throw new Error('Invalid create message response: empty id');
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as { data?: { id?: string }; id?: string };
        const id = parsed.data?.id ?? parsed.id;
        if (id) return id;
      } catch {
        // fall through: treat as plain id string
      }
    }
    return trimmed;
  }
  const id = response.data?.id ?? response.id;
  if (id) return id;
  throw new Error('Invalid create message response: missing id');
}

/** POST /api/messages/content — textData.historyMessages item */
export interface MessageContentHistoryItem {
  type: string;
  content: string;
  attachmentsCount: number;
}

/** POST /api/messages/content — textData.tools item */
export interface MessageContentToolItem {
  name: string;
  server_label?: string;
  server_url?: string;
  require_approval?: string;
}

/** Web検索有効時に textData.tools へ付与する値 */
export const MESSAGE_CONTENT_WEB_SEARCH_TOOLS: MessageContentToolItem[] = [{ name: 'web_search' }];

/** POST /api/messages/content — textData (optional fields omitted when unset) */
export interface MessageContentTextData {
  assistantId?: string;
  messageId: string;
  messageContentId?: string;
  additionalPrompt?: string;
  userInput: string;
  historyMessages?: MessageContentHistoryItem[];
  tools?: MessageContentToolItem[];
  /** true でチャット回答の代わりにライブラリ（Markdown のまとめ）を生成する */
  createLibrary?: boolean;
}

/** Builds textData for a new message; unset optional fields are omitted from the payload. */
export function buildSendMessageTextData(params: {
  messageId: string;
  userInput: string;
  assistantId?: string;
  messageContentId?: string;
  additionalPrompt?: string;
  historyMessages?: MessageContentHistoryItem[];
  tools?: MessageContentToolItem[];
  createLibrary?: boolean;
}): MessageContentTextData {
  const data: MessageContentTextData = {
    messageId: params.messageId,
    userInput: params.userInput,
  };

  if (params.assistantId) {
    data.assistantId = params.assistantId;
  }
  if (params.messageContentId) {
    data.messageContentId = params.messageContentId;
  }
  if (params.additionalPrompt) {
    data.additionalPrompt = params.additionalPrompt;
  }
  if (params.historyMessages?.length) {
    data.historyMessages = params.historyMessages;
  }
  if (params.tools?.length) {
    data.tools = params.tools;
  }
  if (params.createLibrary) {
    data.createLibrary = true;
  }

  return data;
}

/** POST /api/messages/contents — request body */
export interface MessageContentsRequest {
  messageIds: string[];
}

/** POST /api/messages/contents — single item (wire format) */
export interface MessageContentApiItem {
  id: string;
  messageId: string;
  status: ResponseStatus;
  question: string | null;
  answer: string | null;
  context: string | null;
  attachmentFiles?: FileAttachment[];
  referencePaths?: ReferenceFilePaths[] | null;
  isRated: boolean;
  /** Shown when status is ERROR */
  message?: string | null;
}

/** POST /api/messages/contents — JSON array response */
export type MessageContentsApiResponse = MessageContentApiItem[];

function normalizeReferencePaths(item: MessageContentApiItem): ReferenceFilePaths[] {
  return item.referencePaths ?? [];
}

function toMessage(
  item: MessageContentApiItem,
  overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'question' | 'answer'>,
  assistantId?: string,
): Message {
  return {
    id: overrides.id,
    messageId: overrides.messageId ?? item.messageId,
    role: overrides.role,
    status: overrides.status ?? item.status,
    question: overrides.question,
    answer: overrides.answer,
    context: overrides.context ?? item.context ?? '',
    attachmentFiles: overrides.attachmentFiles ?? item.attachmentFiles ?? [],
    referenceFilePaths: overrides.referenceFilePaths ?? normalizeReferencePaths(item),
    isRated: overrides.isRated ?? item.isRated,
    rating: overrides.rating ?? null,
    assistantId: overrides.assistantId ?? assistantId,
    message: overrides.message ?? item.message ?? undefined,
  };
}

/** Maps a streamed/final message_content payload to an assistant Message. */
export function mapMessageContentItemToAssistantMessage(
  item: MessageContentApiItem,
  localId: string,
): Message {
  const answer = item.answer?.trim() ?? '';
  const contentId = item.id?.trim();
  return {
    id: contentId || localId,
    messageId: item.messageId,
    role: 'assistant',
    status: item.status,
    question: '',
    answer,
    context: item.context ?? '',
    attachmentFiles: item.attachmentFiles ?? [],
    referenceFilePaths: normalizeReferencePaths(item),
    isRated: item.isRated,
    message: item.message ?? undefined,
  };
}

/** Maps POST /messages/contents array to UI messages (user + assistant per item). */
export function mapMessageContentsToMessages(
  items: MessageContentApiItem[],
  assistantIdByMessageId: Map<string, string>,
): Message[] {
  const result: Message[] = [];

  for (const item of items) {
    const assistantId = assistantIdByMessageId.get(item.messageId);
    const question = item.question?.trim() ?? '';
    const answer = item.answer?.trim() ?? '';

    if (question) {
      result.push(
        toMessage(
          item,
          {
            id: item.messageId,
            role: 'user',
            question,
            answer: '',
            messageId: item.messageId,
            isRated: false,
          },
          assistantId,
        ),
      );
    }

    if (answer || item.status === 'ERROR') {
      result.push(
        toMessage(
          item,
          {
            id: item.id,
            role: 'assistant',
            question: '',
            answer,
            messageId: item.messageId,
            isRated: item.isRated,
            message: item.message ?? undefined,
          },
          assistantId,
        ),
      );
    }
  }

  return result;
}
