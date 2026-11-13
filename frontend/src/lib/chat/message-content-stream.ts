import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { parseSseChunk } from '@/lib/utils/sse-parser';
import {
  mapMessageContentItemToAssistantMessage,
  type MessageContentApiItem,
} from '@/types/chat/message-api.type';
import type {
  MessageContentStreamEvent,
  MessageContentStreamHandlers,
} from '@/types/chat/message-content-stream.type';
import type { Message } from '@/types/chat/message.type';

/**
 * 回答の送信先。
 * `naw` は NAW サーバー（`API_PATHS.MESSAGES.CONTENT`）、`local` は SECURE アシスタントのローカルサーバー。
 * ローカルは絶対 URL とアクセスキーで呼ぶ（Cookie と X-Tenant-ID は送らない。移植元と同じ）。
 */
export type ContentStreamTarget =
  | { kind: 'naw' }
  | { kind: 'local'; contentUrl: string; apiKey: string };

const SSE_ACCEPT = 'text/event-stream';
const LOCAL_AUTH_HEADER = 'X-Server-Auth-Key';

/** 受け取った JSON を MessageContentApiItem の形に整える（欠けた項目の既定値は移植元と同じ） */
function normalizeContentItem(raw: Record<string, unknown>): MessageContentApiItem {
  const item = raw as unknown as Partial<MessageContentApiItem>;
  return {
    id: String(item.id ?? ''),
    messageId: String(item.messageId ?? ''),
    status: item.status ?? 'OK',
    question: item.question ?? null,
    answer: item.answer ?? null,
    context: item.context ?? null,
    attachmentFiles: item.attachmentFiles ?? [],
    referencePaths: item.referencePaths ?? null,
    isRated: Boolean(item.isRated),
    message: item.message ?? null,
  };
}

function parseStreamEvent(raw: unknown): MessageContentStreamEvent | null {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const type = record['type'];
  const text = record['text'];

  if (
    (type === 'reasoning_delta' ||
      type === 'text_delta' ||
      type === 'library_title_delta' ||
      type === 'library_content_delta') &&
    typeof text === 'string'
  ) {
    return { type, text };
  }
  if (type === 'message_stop') {
    return {
      type: 'message_stop',
      inputTokens: Number(record['inputTokens'] ?? 0),
      outputTokens: Number(record['outputTokens'] ?? 0),
    };
  }
  if (type === 'message_content' && record['data'] && typeof record['data'] === 'object') {
    return {
      type: 'message_content',
      data: normalizeContentItem(record['data'] as Record<string, unknown>),
    };
  }
  return null;
}

/** イベントをハンドラーへ振り分け、message_content を受け取ったらその内容を返す（それ以外は currentFinal のまま） */
function dispatchStreamEvent(
  raw: unknown,
  handlers: MessageContentStreamHandlers,
  currentFinal: MessageContentApiItem | null,
): MessageContentApiItem | null {
  const event = parseStreamEvent(raw);
  if (!event) {
    return currentFinal;
  }

  switch (event.type) {
    case 'reasoning_delta':
      handlers.onReasoningDelta?.(event.text);
      return currentFinal;
    case 'text_delta':
      handlers.onTextDelta(event.text);
      return currentFinal;
    case 'library_title_delta':
      handlers.onLibraryTitleDelta?.(event.text);
      return currentFinal;
    case 'library_content_delta':
      handlers.onLibraryContentDelta?.(event.text);
      return currentFinal;
    case 'message_stop':
      handlers.onMessageStop?.({
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
      });
      return currentFinal;
    case 'message_content':
      handlers.onMessageContent(event.data);
      return event.data;
    default:
      return currentFinal;
  }
}

function openStream(formData: FormData, target: ContentStreamTarget): Promise<Response> {
  if (target.kind === 'local') {
    return apiClient.stream(target.contentUrl, {
      body: formData,
      headers: { Accept: SSE_ACCEPT, [LOCAL_AUTH_HEADER]: target.apiKey },
      credentials: 'omit',
      omitTenantId: true,
    });
  }
  return apiClient.stream(API_PATHS.MESSAGES.CONTENT, {
    body: formData,
    headers: { Accept: SSE_ACCEPT },
  });
}

/**
 * POST /api/messages/content の SSE を読み、イベントごとに handlers を呼ぶ（移植元 MessageContentStreamService.streamMessageContent）。
 * 最後の `message_content` を assistant の Message にして返す。届かなかったときはエラーを投げる。
 * 移植元の `enableMock`（モック応答）は React では MSW をテストだけで使うため移植していない。
 *
 * Parameters
 * ----------
 * formData : 送信する multipart（`textData` と添付ファイル）。
 * localMessageId : 回答が届くまで画面で使う仮の ID。
 * handlers : 受信したイベントの通知先。
 * target : 送信先。省略時は NAW サーバー。
 */
export async function streamMessageContent(
  formData: FormData,
  localMessageId: string,
  handlers: MessageContentStreamHandlers,
  target: ContentStreamTarget = { kind: 'naw' },
): Promise<Message> {
  const response = await openStream(formData, target);
  if (!response.body) {
    throw new Error('Message content stream has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalItem: MessageContentApiItem | null = null;

  const consume = (chunk: string): void => {
    const events = parseSseChunk(buffer, chunk);
    let result = events.next();
    while (!result.done) {
      finalItem = dispatchStreamEvent(result.value, handlers, finalItem) ?? finalItem;
      result = events.next();
    }
    buffer = result.value;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      consume(decoder.decode(value, { stream: true }));
    }

    // 最後のイベントが改行で終わっていないときの取りこぼしを防ぐ
    if (buffer.trim()) {
      const trailing = `${buffer}\n`;
      buffer = '';
      consume(trailing);
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalItem) {
    throw new Error('Message content stream ended without message_content event');
  }

  return mapMessageContentItemToAssistantMessage(finalItem, localMessageId);
}
