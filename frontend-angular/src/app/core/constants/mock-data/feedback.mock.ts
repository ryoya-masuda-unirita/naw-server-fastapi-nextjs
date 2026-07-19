import type {
  GetMessageFeedbackViewModel,
  GetRoomFeedbackViewModel,
  MessageFeedback,
  RoomFeedback,
} from '@app-types/admin/feedback.types';
import type { ChatRoom, RoomFeedbackRating } from '@app-types/chat/chat-room.type';
import { MOCK_ASSISTANTS } from './assistants.mock';
import {
  MOCK_MESSAGE_CONTENTS,
  MOCK_MESSAGE_RECORDS,
  type MockMessageContentApiItem,
} from './messages.mock';
import { MOCK_ROOMS } from './rooms.mock';

// ─── Additional Learning ─────────────────────────────────────────────────────

export interface AdditionalLearningRequest {
  feedbackId?: string;
  roomId?: string;
  content: File | Blob;
}

export interface AdditionalLearningResponse {
  message: string;
  data: { folderId: string };
}

// ─── Learning Folders ─────────────────────────────────────────────────────────

export interface LearningFolderItem {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface LearningFoldersResponse {
  data: LearningFolderItem[];
}

export const MOCK_LEARNING_FOLDERS: LearningFolderItem[] = [
  {
    id: 'folder-abcd',
    name: 'フォルダABCD',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
  {
    id: 'folder-a',
    name: 'フォルダA',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
  {
    id: 'folder-b',
    name: 'フォルダB',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
  {
    id: 'folder-c',
    name: 'フォルダC',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
  {
    id: 'folder-d',
    name: 'フォルダD',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
  {
    id: 'folder-e',
    name: 'フォルダE',
    description: '説明テキスト説明テキスト説明テキスト説明テキスト',
    category: 'カテゴリカテゴリ',
  },
];

const TENANT_ID = 'tenant-001';

const MOCK_FEEDBACK_USERS = [
  { id: 'user-001', name: '苗字 名前' },
  { id: 'user-002', name: '田中 太郎' },
  { id: 'user-003', name: '山田 花子' },
  { id: 'user-004', name: '佐藤 一郎' },
  { id: 'user-005', name: '鈴木 花子' },
];

const pickBySeed = <T>(items: T[], seed: number): T => items[Math.abs(seed) % items.length];

const toMockIsoString = (value: Date | string | undefined, fallback: string): string => {
  if (!value) return fallback;
  if (value instanceof Date) return value.toISOString();
  return value;
};

const getAssistantName = (assistantId: string | undefined): string =>
  MOCK_ASSISTANTS.find((assistant) => assistant.id === assistantId)?.name ?? assistantId ?? '';

const getMessageAssistantName = (assistantId: string | undefined): string | null =>
  getAssistantName(assistantId) || null;

const getRoomDefaultAssistantName = (assistantId: string | undefined): string | null =>
  getAssistantName(assistantId) || null;

const getLearningFolderName = (folderId: string | undefined): string =>
  MOCK_LEARNING_FOLDERS.find((folder) => folder.id === folderId)?.name ?? folderId ?? '';

const makeFeedback = (
  id: string,
  messageId: string,
  createdAt: string,
  indexId?: string,
): MessageFeedback => {
  const content = MOCK_MESSAGE_CONTENTS[messageId];
  if (!content) {
    throw new Error(
      `MOCK_FEEDBACK_MESSAGES messageId is missing from MOCK_MESSAGE_CONTENTS: ${messageId}`,
    );
  }
  if (!content.isRated || !content.rating) {
    throw new Error(
      `MOCK_FEEDBACK_MESSAGES messageId must reference a rated MOCK_MESSAGE_CONTENTS item: ${messageId}`,
    );
  }

  const index = Number(id.replace(/\D/g, '')) - 1 || 0;
  const record = MOCK_MESSAGE_RECORDS.find((message) => message.id === messageId);
  if (record) record.isRated = true;

  const room =
    MOCK_ROOMS.find((item) => item.id === record?.roomId) ?? pickBySeed(MOCK_ROOMS, index * 7 + 3);
  const assistant = pickBySeed(MOCK_ASSISTANTS, index * 5 + 1);
  const user = pickBySeed(MOCK_FEEDBACK_USERS, index * 3 + 2);
  const updatedAt = toMockIsoString(room.updatedAt ?? room.lastMessageTime, createdAt);
  const assistantId = record?.assistantId ?? room.defaultAssistantId ?? assistant.id;
  const parentContent = record?.parentId ? MOCK_MESSAGE_CONTENTS[record.parentId] : undefined;

  return {
    id,
    tenantId: TENANT_ID,
    userId: user.id,
    messageId,
    rating: content.rating,
    indexId,
    createdAt,
    updatedAt,
    message: {
      id: messageId,
      tenantId: TENANT_ID,
      roomId: record?.roomId ?? room.id,
      assistantId,
      assistantName: getMessageAssistantName(assistantId),
      parentId: record?.parentId ?? '',
      rated: true,
      content: {
        id: content.id,
        tenantId: TENANT_ID,
        messageId,
        status: content.status === 'ERROR' ? 'ERROR' : 'OK',
        question: parentContent?.question ?? '',
        answer: content.answer ?? '',
        context: content.context ?? '',
        filePathsString: '',
        referenceFilePaths: content.referencePaths?.map((file) => file.url) ?? [],
        createdAt,
        updatedAt,
      },
    },
  };
};

const ratedMessageIds = Object.values(MOCK_MESSAGE_CONTENTS)
  .filter((message) => message.isRated && message.rating)
  .map((message) => message.messageId);

const feedbackIndexIds = [
  'folder-a',
  'folder-b',
  undefined,
  'folder-abcd',
  undefined,
  'folder-c',
  'folder-d',
  'folder-e',
  undefined,
  'folder-abcd',
] as const;

export const MOCK_FEEDBACK_MESSAGES: MessageFeedback[] = ratedMessageIds.map((messageId, index) =>
  makeFeedback(
    `fb-${String(index + 1).padStart(3, '0')}`,
    messageId,
    `2025-04-${String(index + 1).padStart(2, '0')}T09:00:00Z`,
    feedbackIndexIds[index % feedbackIndexIds.length],
  ),
);

const syncMessageFeedbackWithContent = (feedback: MessageFeedback): MessageFeedback | null => {
  const content: MockMessageContentApiItem | undefined = MOCK_MESSAGE_CONTENTS[feedback.messageId];
  if (!content) return null;

  const record = MOCK_MESSAGE_RECORDS.find((message) => message.id === feedback.messageId);
  const parentContent = record?.parentId ? MOCK_MESSAGE_CONTENTS[record.parentId] : undefined;
  content.isRated = true;
  content.rating = feedback.rating;
  if (record) record.isRated = true;

  return {
    ...feedback,
    messageId: content.messageId,
    message: {
      ...feedback.message,
      id: content.messageId,
      roomId: record?.roomId ?? feedback.message.roomId,
      assistantId: record?.assistantId ?? feedback.message.assistantId,
      assistantName: getMessageAssistantName(record?.assistantId ?? feedback.message.assistantId),
      parentId: record?.parentId ?? feedback.message.parentId,
      rated: true,
      content: {
        ...feedback.message.content,
        id: content.id,
        messageId: content.messageId,
        status: content.status === 'ERROR' ? 'ERROR' : 'OK',
        question: parentContent?.question ?? '',
        answer: content.answer ?? '',
        context: content.context ?? '',
        referenceFilePaths: content.referencePaths?.map((file) => file.url) ?? [],
      },
    },
  };
};

const makeRoomFeedback = (room: ChatRoom, index: number): RoomFeedback => {
  const assistant = pickBySeed(MOCK_ASSISTANTS, index * 5 + 1);
  const user = pickBySeed(MOCK_FEEDBACK_USERS, index * 3 + 2);
  const learningFolder = index % 3 === 1 ? undefined : pickBySeed(MOCK_LEARNING_FOLDERS, index * 2);
  const createdAt = toMockIsoString(
    room.updatedAt ?? room.lastMessageTime,
    `2025-04-${String(index + 1).padStart(2, '0')}T09:00:00Z`,
  );

  return {
    id: `rfb-${String(index + 1).padStart(3, '0')}`,
    tenantId: TENANT_ID,
    userId: user.id,
    userName: user.name,
    roomId: room.id,
    rating: room.rating,
    indexId: learningFolder?.id,
    createdAt,
    updatedAt: createdAt,
    room: {
      ...room,
      defaultAssistantId: room.defaultAssistantId ?? assistant.id,
      defaultAssistantName: getRoomDefaultAssistantName(room.defaultAssistantId ?? assistant.id),
      userId: room.userId ?? user.id,
      userName: room.userName ?? user.name,
    },
  };
};

export const MOCK_FEEDBACK_ROOMS: RoomFeedback[] = MOCK_ROOMS.filter((room) => !!room.rating).map(
  makeRoomFeedback,
);

export const upsertRoomFeedback = (room: ChatRoom, rating: RoomFeedbackRating): RoomFeedback => {
  room.rating = rating;
  const now = new Date().toISOString();
  const existing = MOCK_FEEDBACK_ROOMS.find((feedback) => feedback.roomId === room.id);
  if (existing) {
    existing.rating = rating;
    existing.updatedAt = now;
    existing.room = {
      ...existing.room,
      ...room,
      rating,
    };
    return existing;
  }

  const feedback = makeRoomFeedback(room, MOCK_FEEDBACK_ROOMS.length);
  feedback.rating = rating;
  feedback.createdAt = now;
  feedback.updatedAt = now;
  feedback.room.rating = rating;
  MOCK_FEEDBACK_ROOMS.unshift(feedback);
  return feedback;
};

export const buildFeedbackMessagesResponse = (
  rating?: string,
  assistantId?: string,
  folderId?: string,
  page = 0,
  size = 25,
  sortField?: string,
  sortOrder?: string,
): GetMessageFeedbackViewModel => {
  let data = MOCK_FEEDBACK_MESSAGES.map(syncMessageFeedbackWithContent).filter(
    (feedback): feedback is MessageFeedback => feedback !== null,
  );
  if (rating === 'GOOD') data = data.filter((f) => f.rating === 'GOOD');
  else if (rating === 'BAD') data = data.filter((f) => f.rating === 'BAD');
  if (assistantId) data = data.filter((f) => f.message.assistantId === assistantId);
  if (folderId) data = data.filter((f) => f.indexId === folderId);

  if (sortField) {
    const dir = sortOrder === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      switch (sortField) {
        case 'updatedAt':
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
        case 'name':
          return (a.message.assistantName ?? '').localeCompare(b.message.assistantName ?? '') * dir;
        case 'accuracy':
          return a.rating.localeCompare(b.rating) * dir;
        case 'add':
          return ((a.indexId ? 1 : 0) - (b.indexId ? 1 : 0)) * dir;
        case 'folder':
          return (
            getLearningFolderName(a.indexId).localeCompare(getLearningFolderName(b.indexId)) * dir
          );
        default:
          return 0;
      }
    });
  }

  const totalElements = data.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / size));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const content = data.slice(safePage * size, safePage * size + size);

  return {
    feedbacks: {
      content,
      totalElements,
      totalPages,
      size,
      number: safePage,
      first: safePage === 0,
      last: safePage >= totalPages - 1,
      numberOfElements: content.length,
      empty: content.length === 0,
      sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
      pageable: {
        offset: safePage * size,
        paged: true,
        unpaged: false,
        pageNumber: safePage,
        pageSize: size,
        sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
      },
    },
    assistantIdToServerMap: {},
  };
};

export const buildFeedbackRoomsResponse = (
  rating?: string,
  assistantId?: string,
  folderId?: string,
  page = 0,
  size = 25,
  sortField?: string,
  sortOrder?: string,
): GetRoomFeedbackViewModel => {
  let data = [...MOCK_FEEDBACK_ROOMS];
  if (rating === 'UNRATED') data = data.filter((f) => !f.rating);
  else if (rating) data = data.filter((f) => f.rating === rating);
  if (assistantId) data = data.filter((f) => f.room.defaultAssistantId === assistantId);
  if (folderId) data = data.filter((f) => f.indexId === folderId);

  if (sortField) {
    const dir = sortOrder === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      switch (sortField) {
        case 'updatedAt':
          return a.updatedAt.localeCompare(b.updatedAt) * dir;
        case 'chat':
          return a.room.name.localeCompare(b.room.name) * dir;
        case 'name':
          return (
            (a.room.defaultAssistantName ?? '').localeCompare(b.room.defaultAssistantName ?? '') *
            dir
          );
        case 'level':
          return (a.rating ?? '').localeCompare(b.rating ?? '') * dir;
        case 'add':
          return ((a.indexId ? 1 : 0) - (b.indexId ? 1 : 0)) * dir;
        case 'folder':
          return (
            getLearningFolderName(a.indexId).localeCompare(getLearningFolderName(b.indexId)) * dir
          );
        default:
          return 0;
      }
    });
  }

  const totalElements = data.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / size));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const content = data.slice(safePage * size, safePage * size + size);

  return {
    feedbacks: {
      content,
      totalElements,
      totalPages,
      size,
      number: safePage,
      first: safePage === 0,
      last: safePage >= totalPages - 1,
      numberOfElements: content.length,
      empty: content.length === 0,
      sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
      pageable: {
        offset: safePage * size,
        paged: true,
        unpaged: false,
        pageNumber: safePage,
        pageSize: size,
        sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
      },
    },
  };
};
