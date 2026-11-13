import { create } from 'zustand';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { ChatRoom } from '@/types/chat/chat-room.type';
import type { FileAttachment } from '@/types/chat/file-attachment.type';
import type { ShareAccessResponse } from '@/types/chat/share-api.type';

interface ChatState {
  /** 表示中のルーム。新規チャット画面では null */
  activeRoomId: string | null;
  /** 添付ファイル（移植元 ChatService.attachedFiles。入力欄の添付とは別の状態で、移植元でも画面からは使われていない） */
  attachedFiles: FileAttachment[];
  /** 自分のルーム一覧にない共有ルーム（共有リンクで開いたもの）の情報 */
  sharedRoomContext: ChatRoom | undefined;
}

interface ChatActions {
  /** メッセージを読み込まずに表示中のルームだけ切り替える（移植元 ChatService.setActiveRoomId） */
  setActiveRoomId: (roomId: string | null) => void;
  /** ルームを選び、そのメッセージを読み込む（移植元 ChatService.selectRoom） */
  selectRoom: (roomId: string) => void;
  /** 新規チャットを始める。表示中のルームとメッセージを空にする（移植元 ChatService.startNewChat） */
  startNewChat: () => void;
  addAttachment: (file: File) => void;
  removeAttachment: (fileId: string) => void;
  clearAttachments: () => void;
  /** 共有ルームを開く。自分の一覧にあれば文脈は持たず、なければ共有情報から作る（移植元 ChatService.openSharedRoom） */
  openSharedRoom: (access: ShareAccessResponse, shareId: string) => Promise<void>;
  clearSharedRoomContext: () => void;
  /** 管理者のチャット履歴詳細で開くルームの文脈を作り、表示中のルームにする（移植元 ChatService.openAdminHistoryRoom） */
  openAdminHistoryRoom: (params: AdminHistoryRoomParams) => void;
  /** 管理者のチャット履歴詳細の文脈を捨てる（移植元 ChatService.clearAdminHistoryRoomContext） */
  clearAdminHistoryRoomContext: () => void;
}

interface AdminHistoryRoomParams {
  id: string;
  name: string;
  userId?: string;
  userName?: string;
}

/**
 * 移植元 ChatService のうち、messages・rooms の store に属さない状態（表示中のルーム・添付ファイル・共有ルームの文脈）。
 */
export const useChatStore = create<ChatState & ChatActions>((set) => ({
  activeRoomId: null,
  attachedFiles: [],
  sharedRoomContext: undefined,
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  selectRoom: (roomId) => {
    set({ activeRoomId: roomId });
    void useMessagesStore.getState().loadMessagesForRoom(roomId);
  },
  startNewChat: () => {
    set({ activeRoomId: null, attachedFiles: [] });
    useMessagesStore.getState().clearMessages();
  },
  addAttachment: (file) => {
    const attachment: FileAttachment = {
      id: `file-${Date.now()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    };
    set((state) => ({ attachedFiles: [...state.attachedFiles, attachment] }));
  },
  removeAttachment: (fileId) =>
    set((state) => ({ attachedFiles: state.attachedFiles.filter((file) => file.id !== fileId) })),
  clearAttachments: () => set({ attachedFiles: [] }),
  openSharedRoom: async (access, shareId) => {
    const existing = useRoomsStore.getState().allRooms.find((room) => room.id === access.roomId);
    set({
      sharedRoomContext: existing
        ? undefined
        : {
            id: access.roomId,
            name: access.roomName ?? '',
            isPinned: false,
            category: 'chat',
            shareId,
            teamIds: access.teamIds,
          },
      activeRoomId: access.roomId,
    });
    await useMessagesStore.getState().loadMessagesForRoom(access.roomId, true);
  },
  clearSharedRoomContext: () => set({ sharedRoomContext: undefined }),
  // 移植元は共有ルームと同じ文脈の置き場（_sharedRoomContext）を使う
  openAdminHistoryRoom: ({ id, name, userId, userName }) =>
    set({
      sharedRoomContext: { id, name, isPinned: false, category: 'chat', userId, userName },
      activeRoomId: id,
    }),
  clearAdminHistoryRoomContext: () => set({ sharedRoomContext: undefined }),
}));

/** 表示中のルーム（移植元 ChatService.activeRoom）。ルーム一覧になければ共有ルームの文脈を返す */
export function useActiveRoom(): ChatRoom | undefined {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const sharedRoomContext = useChatStore((s) => s.sharedRoomContext);
  const fromList = useRoomsStore((s) => s.allRooms.find((room) => room.id === activeRoomId));
  if (!activeRoomId) return undefined;
  // 別のルームへ移ったあとに、前の共有ルームの文脈を返さないよう ID を確かめる（移植元にはない）
  return fromList ?? (sharedRoomContext?.id === activeRoomId ? sharedRoomContext : undefined);
}
