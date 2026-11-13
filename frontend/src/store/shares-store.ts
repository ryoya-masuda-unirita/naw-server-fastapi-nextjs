import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { ShareAccessResponse, ShareResponse } from '@/types/chat/share-api.type';

interface SharesState {
  isSharing: boolean;
  isUnsharing: boolean;
  isResolvingAccess: boolean;
  shareRoom: (roomId: string, teamIds: string[]) => Promise<ShareResponse>;
  unshareRoom: (shareId: string) => Promise<void>;
  resolveShareAccess: (shareId: string) => Promise<ShareAccessResponse>;
}

/**
 * 共有リンクで開いたルーム（一覧にないもの）の共有情報も合わせる。
 * 移植元は一覧のルームしか更新しないため、共有ダイアログに古い共有状態が残る（移植元にはない対応）
 */
function updateSharedRoomContext(
  roomId: string,
  partial: { shareId: string | null; teamIds: string[] },
): void {
  const context = useChatStore.getState().sharedRoomContext;
  if (context?.id === roomId) {
    useChatStore.setState({ sharedRoomContext: { ...context, ...partial } });
  }
}

/** 移植元 SharesService。backend は応答を `{ data }` で包む（#309） */
export const useSharesStore = create<SharesState>((set) => ({
  isSharing: false,
  isUnsharing: false,
  isResolvingAccess: false,

  shareRoom: async (roomId, teamIds) => {
    set({ isSharing: true });
    try {
      const response = await apiClient.post<{ data: ShareResponse }>(API_PATHS.SHARES.CREATE, {
        roomId,
        teamIds,
      });
      useRoomsStore
        .getState()
        .updateRoom(roomId, { shareId: response.data.id, teamIds: response.data.teamIds });
      updateSharedRoomContext(roomId, { shareId: response.data.id, teamIds: response.data.teamIds });
      return response.data;
    } finally {
      set({ isSharing: false });
    }
  },

  unshareRoom: async (shareId) => {
    set({ isUnsharing: true });
    try {
      await apiClient.delete(API_PATHS.SHARES.DELETE(shareId));
      const room = useRoomsStore.getState().allRooms.find((r) => r.shareId === shareId);
      if (room) {
        useRoomsStore.getState().updateRoom(room.id, { shareId: null, teamIds: [] });
      }
      const sharedRoomId = useChatStore.getState().sharedRoomContext?.shareId === shareId
        ? useChatStore.getState().sharedRoomContext?.id
        : undefined;
      if (sharedRoomId) updateSharedRoomContext(sharedRoomId, { shareId: null, teamIds: [] });
    } finally {
      set({ isUnsharing: false });
    }
  },

  resolveShareAccess: async (shareId) => {
    set({ isResolvingAccess: true });
    try {
      const response = await apiClient.get<{ data: ShareAccessResponse }>(
        API_PATHS.SHARES.ACCESS(shareId),
      );
      return response.data;
    } finally {
      set({ isResolvingAccess: false });
    }
  },
}));
