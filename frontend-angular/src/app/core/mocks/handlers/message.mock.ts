import type { MessageFeedback } from '@app-types/admin/feedback.types';
import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_FEEDBACK_MESSAGES } from '../../constants/mock-data/feedback.mock';
import { MOCK_ASSISTANTS } from '../../constants/mock-data/assistants.mock';
import {
  MOCK_MESSAGE_CONTENTS,
  MOCK_MESSAGE_LIST_ASSISTANTS,
  MOCK_MESSAGE_RECORDS,
  MOCK_LOCAL_SERVER_BASE_URL,
} from '../../constants/mock-data/messages.mock';
import type { MOCK_ROOMS } from '../../constants/mock-data/rooms.mock';
import type { MockRoute } from '../api-mock';

type RuntimeRoom = (typeof MOCK_ROOMS)[number];

const ASSISTANT_RESPONSES = [
  `<p>承知いたしました。ご質問の内容を確認し、分析いたしました。詳細な情報が必要な場合はお気軽にお尋ねください。</p>`,
  `<p><strong>分析結果</strong><br>データの処理が完了しました。結果を右パネルに表示しています。</p><ul><li>処理件数: 1,234件</li><li>成功率: 98%</li></ul>`,
  `<p>ご質問ありがとうございます。以下の情報をご参照ください。</p>`,
];

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

function getPathOnly(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

const randomAnswer = (): string =>
  ASSISTANT_RESPONSES[Math.floor(Math.random() * ASSISTANT_RESPONSES.length)];

const buildAssistantMessage = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: `mc-${Date.now()}`,
  messageId: `msg-${Date.now()}`,
  role: 'assistant' as const,
  status: 'complete' as const,
  question: '',
  answer: randomAnswer(),
  context: '',
  attachmentFiles: [],
  referencePaths: [],
  isRated: false,
  ...overrides,
});

function isMessageFeedbackRating(value: unknown): value is MessageFeedback['rating'] {
  return value === 'GOOD' || value === 'BAD';
}

function ensureMessageBackedByMockContent(messageId: string, runtimeRooms: RuntimeRoom[]) {
  const now = new Date().toISOString();
  const room = runtimeRooms[0];

  let content = MOCK_MESSAGE_CONTENTS[messageId];
  if (!content) {
    content = {
      id: messageId,
      messageId,
      status: 'OK',
      question: '',
      answer: '',
      context: '',
      attachmentFiles: [],
      referencePaths: [],
      isRated: false,
    };
    MOCK_MESSAGE_CONTENTS[messageId] = content;
  }

  let record = MOCK_MESSAGE_RECORDS.find((message) => message.id === messageId);
  if (!record) {
    record = {
      id: messageId,
      roomId: room?.id ?? 'room-001',
      assistantId: room?.defaultAssistantId ?? 'asst-001',
      parentId: null,
      isRated: false,
    };
    MOCK_MESSAGE_RECORDS.push(record);
  }

  content.isRated = true;
  record.isRated = true;
  return { content, record, room, now };
}

function getParentQuestion(parentId: string | null): string {
  return parentId ? (MOCK_MESSAGE_CONTENTS[parentId]?.question ?? '') : '';
}

function getMessageAssistantName(assistantId: string): string | null {
  return MOCK_ASSISTANTS.find((assistant) => assistant.id === assistantId)?.name ?? null;
}

function upsertMessageFeedback(
  messageId: string,
  rating: MessageFeedback['rating'],
  runtimeRooms: RuntimeRoom[],
) {
  const { content, record, now } = ensureMessageBackedByMockContent(messageId, runtimeRooms);
  content.rating = rating;
  const parentQuestion = getParentQuestion(record.parentId);
  const existing = MOCK_FEEDBACK_MESSAGES.find((feedback) => feedback.messageId === messageId);

  if (existing) {
    existing.rating = rating;
    existing.updatedAt = now;
    existing.message.rated = true;
    return existing;
  }

  const room = runtimeRooms.find((item) => item.id === record.roomId) ?? runtimeRooms[0];
  const assistantId = record.assistantId ?? room?.defaultAssistantId ?? 'asst-001';
  const feedback: MessageFeedback = {
    id: `fb-${Date.now()}`,
    tenantId: 'tenant-001',
    userId: room?.userId ?? 'user-001',
    messageId,
    rating,
    createdAt: now,
    updatedAt: now,
    message: {
      id: messageId,
      tenantId: 'tenant-001',
      roomId: record.roomId ?? room?.id ?? 'room-001',
      assistantId,
      assistantName: getMessageAssistantName(assistantId),
      parentId: record.parentId ?? '',
      rated: true,
      content: {
        id: content.id,
        tenantId: 'tenant-001',
        messageId,
        status: content.status === 'ERROR' ? 'ERROR' : 'OK',
        question: parentQuestion,
        answer: content.answer ?? '',
        context: content.context ?? '',
        filePathsString: '',
        referenceFilePaths: content.referencePaths?.map((file) => file.url) ?? [],
        createdAt: now,
        updatedAt: now,
      },
    },
  };

  MOCK_FEEDBACK_MESSAGES.unshift(feedback);
  return feedback;
}

export function messageMockRoutes(runtimeRooms: RuntimeRoom[]): MockRoute[] {
  return [
    {
      method: 'GET',
      match: API_PATHS.MESSAGES.LIST,
      handler: (_url, _body, params) => {
        const roomId = params['roomId'] ?? null;
        const records = MOCK_MESSAGE_RECORDS.filter((r) => !roomId || r.roomId === roomId).map(
          (r) => ({
            ...r,
            roomId: roomId ?? r.roomId,
          }),
        );
        return [200, { assistants: MOCK_MESSAGE_LIST_ASSISTANTS, messages: records }];
      },
    },
    {
      method: 'POST',
      match: new RegExp(`^${MOCK_LOCAL_SERVER_BASE_URL.replace(/\/$/, '')}/api/messages/contents$`),
      handler: (_url, body) => {
        const b = parseBody(body);
        const messageIds: string[] = (b['messageIds'] as string[]) ?? [];
        const contents = messageIds
          .map((id) => MOCK_MESSAGE_CONTENTS[id])
          .filter(
            (item): item is NonNullable<(typeof MOCK_MESSAGE_CONTENTS)[string]> => item != null,
          );
        return [200, contents];
      },
    },
    {
      method: 'POST',
      match: API_PATHS.MESSAGES.CONTENTS,
      handler: (_url, body) => {
        const b = parseBody(body);
        const messageIds: string[] = (b['messageIds'] as string[]) ?? [];
        const contents = messageIds
          .map((id) => MOCK_MESSAGE_CONTENTS[id])
          .filter(
            (item): item is NonNullable<(typeof MOCK_MESSAGE_CONTENTS)[string]> => item != null,
          );
        return [200, contents];
      },
    },
    {
      method: 'POST',
      match: API_PATHS.MESSAGES.CONTENT,
      handler: () => [200, buildAssistantMessage()],
    },
    {
      method: 'POST',
      match: API_PATHS.MESSAGES.CREATE,
      handler: () => {
        const newId = `msg-${Date.now()}`;
        return [201, newId];
      },
    },
    {
      method: 'DELETE',
      match: new RegExp(`^${API_PATHS.MESSAGES.CONTENTS}/[^/]+$`),
      handler: (url) => {
        const id = getPathOnly(url).split('/').at(-1) ?? '';
        return [200, { data: { id } }];
      },
    },
    {
      method: 'POST',
      match: new RegExp(`^${API_PATHS.MESSAGES.CREATE}/[^/]+/feedback$`),
      handler: (url, body) => {
        const parts = getPathOnly(url).split('/');
        const messageId = parts[parts.length - 2];
        const b = parseBody(body);
        const rating = b['rating'];
        if (!isMessageFeedbackRating(rating)) return [400, { message: 'リクエスト不正' }];

        const feedback = upsertMessageFeedback(messageId, rating, runtimeRooms);
        const record = MOCK_MESSAGE_RECORDS.find((message) => message.id === messageId);
        if (record) record.isRated = true;
        if (MOCK_MESSAGE_CONTENTS[messageId]) MOCK_MESSAGE_CONTENTS[messageId].isRated = true;

        return [200, { data: feedback }];
      },
    },
    {
      method: 'POST',
      match: new RegExp(`^${API_PATHS.MESSAGES.CREATE}/[^/]+$`),
      handler: (url, body) => {
        const messageId = getPathOnly(url).split('/').at(-1) ?? '';
        const b = parseBody(body);
        return [
          200,
          buildAssistantMessage({ messageId, question: (b['messageText'] as string) ?? '' }),
        ];
      },
    },
    {
      method: 'DELETE',
      match: new RegExp(`^${API_PATHS.MESSAGES.CREATE}/(?!contents?(/|$))[^/]+$`),
      handler: (url) => {
        const messageId = getPathOnly(url).split('/').at(-1) ?? '';
        return [200, { data: { id: messageId } }];
      },
    },
  ];
}
