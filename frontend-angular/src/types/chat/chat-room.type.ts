export type RoomFeedbackRating = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'AVERAGE' | 'POOR';

export interface ChatRoom {
  id: string;
  name: string;
  isPinned: boolean;
  defaultAssistantId?: string;
  defaultAssistantName?: string | null;
  lastMessage?: string;
  lastMessageTime?: Date | string;
  userId?: string;
  userName?: string;
  description?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  category: 'data' | 'knowledge' | 'chat';
  shareId?: string | null;
  teamIds?: string[];
  rating?: RoomFeedbackRating;
}

// GET /api/rooms list item
export interface RoomListApiItem {
  id: string;
  name: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  defaultAssistantId?: string;
  tenantId: string;
  userId: string;
  rating: RoomFeedbackRating | null;
  shareUrl: string | null;
  teamIds?: string[];
}

// GET /api/rooms (wire format)
// 実APIは Spring Data の Page 形式 (totalElements/totalPages/number/size) を返す。
// 旧形式 (total/page/pageSize) も後方互換のため任意で受け付ける。
export interface RoomsListApiResponse {
  content: RoomListApiItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

// GET /api/rooms (domain model)
export interface RoomsListResponse {
  content: ChatRoom[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoomListParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  size?: number;
  name?: string;
  isPinned?: boolean | string;
}

export interface RoomPinUpdate {
  roomId: string;
  isPinned: boolean;
}

export interface BulkUpdateRoomPinsRequest {
  rooms: RoomPinUpdate[];
}

// POST /api/rooms
export interface CreateRoomRequest {
  name: string;
  assistantId: string;
}

export interface CreateRoomResponse {
  data: ChatRoom;
}

// POST /api/rooms/{roomId}/pin — 成功時はレスポンスボディなし (null)

// PATCH /api/rooms/{roomId}
export interface RenameRoomRequest {
  name: string;
}

export interface RenameRoomResponse {
  id: string;
  name: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  defaultAssistantId?: string;
  tenantId: string;
  userId: string;
  rating: RoomFeedbackRating | null;
  shareUrl: string | null;
  teamIds?: string[];
}

export type RoomApiItem = RoomListApiItem | RenameRoomResponse;

// DELETE /api/rooms/{roomId}
export interface DeleteRoomResponse {
  success: boolean;
  roomId: string;
}

// POST /api/rooms/{roomId}/feedback
export interface RoomFeedbackRequest {
  rating: RoomFeedbackRating;
}

export interface RoomFeedbackResponse {
  data: {
    roomId: string;
    rating: RoomFeedbackRating;
  };
}
