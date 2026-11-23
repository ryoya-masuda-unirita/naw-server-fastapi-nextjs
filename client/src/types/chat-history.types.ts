export interface ChatHistoryItem {
  id: string;
  date: string;
  userId: string;
  userName: string;
  roomName: string;
  description?: string;
}

export type ChatHistorySortField = 'updatedAt' | 'userName' | 'roomName';
export type ChatHistorySortOrder = 'asc' | 'desc';

export interface ChatHistoryFilter {
  query?: string;
  pageSize: number;
  pageIndex: number;
  userId?: string;
  period?: string;
  periodFrom?: string;
  periodTo?: string;
  sortField?: ChatHistorySortField;
  sortOrder?: ChatHistorySortOrder;
}

/** Server contract: /api/admin/histories list response item. */
export interface ChatHistoryApiItem {
  id: string;
  name: string;
  defaultAssistantId?: string;
  userId?: string;
  userName?: string;
  description?: string;
  createdAt?: string;
  updatedAt: string;
  // shareUrl: string;
  // rating: string;
}

/** Server contract: Spring Data page for `/api/admin/histories`. */
export interface ChatHistoryApiResponse {
  content: ChatHistoryApiItem[];
  totalElements: number;
  number: number;
  size: number;
}
