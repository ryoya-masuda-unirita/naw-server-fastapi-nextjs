import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChatDataPanel } from '@/components/features/chat/chat-data-panel';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { Loading } from '@/components/shared/loading';
import { takePendingMessage } from '@/lib/chat/pending-message';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';

/**
 * `/chat/:roomId` のチャットルーム画面（移植元 features/admin/chat-room の AdminChatRoomComponent）。
 * 新規チャットから移ってきたときは、預かった最初のメッセージを送る（メッセージは読み込まない）。
 * それ以外はルームのメッセージを読み込む。回答が 1 つでもあれば右にビューワーの枠を出す。
 *
 * 送信中に別のルームへ移ったときは、移植元と同じく送信を止めない。メッセージ一覧は移動先のものに入れ替わり、
 * 送信中だったメッセージの更新は画面に反映されない（サーバー側では完了する）。
 */
export function AdminChatRoomPage() {
  const { roomId = null } = useParams<{ roomId: string }>();
  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);
  // StrictMode の effect の二重実行で、預かったメッセージを送ったあとに読み込みまで走らないようにする
  const handledRoomId = useRef<string | null>(null);

  // ヘッダーのルーム名はルーム一覧から引く。移植元ではサイドバーが一覧を読み込むが、
  // サイドバーのルーム一覧（#285）が未移植の間は、ここで一覧がなければ読み込む
  useEffect(() => {
    const { allRooms, isAllRoomsLoading, getAllRooms } = useRoomsStore.getState();
    if (allRooms.length === 0 && !isAllRoomsLoading) {
      getAllRooms().catch((error: unknown) => {
        console.error('Load rooms failed', error);
      });
    }
  }, []);

  useEffect(() => {
    if (!roomId || handledRoomId.current === roomId) return;
    handledRoomId.current = roomId;

    useChatStore.getState().setActiveRoomId(roomId);
    const pending = takePendingMessage(roomId);
    if (pending) {
      void useMessagesStore
        .getState()
        .sendMessage(pending.content, pending.files, roomId, [], pending.options);
    } else {
      void useMessagesStore.getState().loadMessagesForRoom(roomId, true);
    }
  }, [roomId]);

  // ライブラリ生成中の表示条件（移植元の `isLibraryStreaming && streamingRoomId === roomId`）は、ビューワー（#288）が足す
  const showViewer = messages.some((message) => message.role === 'assistant');

  return (
    <div className="flex h-screen! overflow-hidden bg-white w-full">
      {isLoading ? (
        <div className="chat-main">
          <Loading />
        </div>
      ) : (
        <>
          <ChatWindow isLoading={isLoading} roomId={roomId} messages={messages} />
          {showViewer && <ChatDataPanel roomId={roomId} />}
        </>
      )}
    </div>
  );
}
