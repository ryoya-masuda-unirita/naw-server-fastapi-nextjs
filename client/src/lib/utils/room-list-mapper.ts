import type {
  ChatRoom,
  RoomApiItem,
  RoomListApiItem,
  RoomsListApiResponse,
} from '@/types/chat/chat-room.type';
import { parseShareIdFromShareUrl } from './share-url';

/** API のルーム 1 件を画面用の ChatRoom にする。API に無い項目（最終メッセージ等）は既存の値を引き継ぐ（移植元 core/utils/room-list-mapper.util.ts） */
export function mapRoomListApiItemToChatRoom(
  api: RoomApiItem | RoomListApiItem,
  existing?: ChatRoom,
): ChatRoom {
  const shareIdFromApi = parseShareIdFromShareUrl(api.shareUrl);

  return {
    id: api.id,
    name: api.name,
    isPinned: api.pinned,
    rating: api.rating ?? undefined,
    lastMessage: existing?.lastMessage,
    lastMessageTime: existing?.lastMessageTime ?? api.updatedAt,
    category: existing?.category ?? 'chat',
    defaultAssistantId: api.defaultAssistantId ?? existing?.defaultAssistantId,
    shareId: existing?.shareId ?? shareIdFromApi ?? undefined,
    teamIds: existing?.teamIds ?? api.teamIds ?? [],
  };
}

export function mapRoomListApiResponse(
  response: RoomsListApiResponse,
  existingById?: Map<string, ChatRoom>,
): ChatRoom[] {
  return response.content.map((item) =>
    mapRoomListApiItemToChatRoom(item, existingById?.get(item.id)),
  );
}

/** 一覧 API の応答から総件数を取る。件数の項目がなければ、その応答の件数（移植元 getRoomListTotalCount） */
export function getRoomListTotalCount(response: RoomsListApiResponse): number {
  return response.total ?? response.totalElements ?? response.content.length;
}
