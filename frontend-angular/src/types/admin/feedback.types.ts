import type { ChatRoom } from '@app-types/chat/chat-room.type';

export interface FeedbackItem {
  id: string;
  accuracy: string;
  assistantName: string;
  learningFolder: string;
  indexId?: string;
  questionSummary: string;
  answerSummary: string;
  updatedAt?: string;
  selected?: boolean;
}

// ─── API response types for GET /api/admin/feedbackMessage ───────────────────

/**
 * メッセージのコンテンツ情報。
 * 実APIレスポンスは question/answer のみ返す。モックは全フィールドを使うため任意フィールドとして保持する。
 */
export interface MessageContentEntity {
  question: string;
  answer: string;
  id?: string;
  tenantId?: string;
  messageId?: string;
  status?: 'OK' | 'ERROR';
  context?: string;
  filePathsString?: string;
  referenceFilePaths?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * メッセージ情報。
 * 実APIレスポンスは assistantId/content のみ返す。モックは全フィールドを使うため任意フィールドとして保持する。
 */
export interface MessageEntity {
  assistantId: string;
  assistantName: string | null;
  content: MessageContentEntity | null;
  id?: string;
  tenantId?: string;
  roomId?: string;
  parentId?: string;
  rated?: boolean;
}

export interface MessageFeedback {
  id: string;
  tenantId: string;
  userId: string;
  messageId: string;
  message: MessageEntity;
  rating: 'GOOD' | 'BAD';
  indexId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SortObject {
  empty: boolean;
  sorted: boolean;
  unsorted: boolean;
}

export interface PageableObject {
  offset: number;
  sort: SortObject;
  paged: boolean;
  pageNumber: number;
  pageSize: number;
  unpaged: boolean;
}

export interface PageMessageFeedback {
  totalPages: number;
  totalElements: number;
  size: number;
  content: MessageFeedback[];
  number: number;
  sort: SortObject;
  pageable: PageableObject;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export interface ExternalServerInfo {
  url: string;
  authKey: string;
}

export interface GetMessageFeedbackViewModel {
  feedbacks: PageMessageFeedback;
  assistantIdToServerMap: Record<string, ExternalServerInfo>;
}

// ─── API response types for GET /api/admin/feedbackRoom ──────────────────────

export interface RoomFeedback {
  id: string;
  tenantId: string;
  userId: string;
  userName?: string;
  roomId?: string;
  room: ChatRoom;
  rating?: ChatRoom['rating'];
  indexId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageRoomFeedback {
  totalPages: number;
  totalElements: number;
  size: number;
  content: RoomFeedback[];
  number: number;
  sort: SortObject;
  pageable: PageableObject;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export interface GetRoomFeedbackViewModel {
  feedbacks: PageRoomFeedback;
}

// ─── API response types for GET /api/admin/feedbackUser ──────────────────────

export interface FeedbackRoomCount {
  excellent: number;
  veryGood: number;
  good: number;
  average: number;
  poor: number;
}

/** バックエンドが返すユーザー情報（feedbackUser レスポンス用の軽量型） */
export interface FeedbackUserInfo {
  id: string;
  userId: string;
  displayName: string;
}

export interface FeedbackUserItem {
  user: FeedbackUserInfo;
  isResponded: boolean;
  feedbackMessageCount: number;
  feedbackRoomCount: FeedbackRoomCount;
  updatedAt?: string;
}

export interface PageFeedbackUser {
  totalPages: number;
  totalElements: number;
  size: number;
  content: FeedbackUserItem[];
  number: number;
  sort: SortObject;
  pageable: PageableObject;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export interface GetFeedbackUserViewModel {
  feedbacks: PageFeedbackUser;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SatisfactionFeedbackItem {
  id: string;
  userName: string;
  satisfaction: 'star5' | 'star4' | 'star3' | 'star2' | 'star1' | 'unrated';
  roomName: string;
  roomId?: string;
  learningFolder: string;
  indexId?: string;
  assistantName?: string;
  addLearning?: string;
  updatedAt?: string;
  selected?: boolean;
}

export interface CountStatItem {
  id: string;
  userName: string;
  isResponded?: boolean;
  updatedAt?: string;
  accuracyCount: number;
  satisfaction1: number;
  satisfaction2: number;
  satisfaction3: number;
  satisfaction4: number;
  satisfaction5: number;
}
