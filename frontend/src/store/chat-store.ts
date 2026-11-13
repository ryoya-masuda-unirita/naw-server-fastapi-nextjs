import { create } from 'zustand';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { ChatRoom } from '@/types/chat/chat-room.type';

interface ChatState {
  /** 表示中のルーム。新規チャット画面では null */
  activeRoomId: string | null;
}

interface ChatActions {
  /** メッセージを読み込まずに表示中のルームだけ切り替える（移植元 ChatService.setActiveRoomId） */
  setActiveRoomId: (roomId: string | null) => void;
  /** ルームを選び、そのメッセージを読み込む（移植元 ChatService.selectRoom） */
  selectRoom: (roomId: string) => void;
  /** 新規チャットを始める。表示中のルームとメッセージを空にする（移植元 ChatService.startNewChat） */
  startNewChat: () => void;
}

/**
 * 移植元 ChatService のうち、messages・rooms の store に属さない状態（表示中のルーム）。
 * 添付ファイル（attachedFiles）・共有ルームの文脈（sharedRoomContext）は、使う画面（#287・#288）が足す。
 */
export const useChatStore = create<ChatState & ChatActions>((set) => ({
  activeRoomId: null,
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  selectRoom: (roomId) => {
    set({ activeRoomId: roomId });
    void useMessagesStore.getState().loadMessagesForRoom(roomId);
  },
  startNewChat: () => {
    set({ activeRoomId: null });
    useMessagesStore.getState().clearMessages();
  },
}));

/** 表示中のルーム（移植元 ChatService.activeRoom）。ルーム一覧にあるものだけ返す */
export function useActiveRoom(): ChatRoom | undefined {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  return useRoomsStore((s) => s.allRooms.find((room) => room.id === activeRoomId));
}
