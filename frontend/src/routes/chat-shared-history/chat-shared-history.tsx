import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChatDataPanel } from '@/components/features/chat/chat-data-panel';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { Loading } from '@/components/shared/loading';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';

/** `/chat-shared-history/:roomId`（移植元 features/admin/chat-shared-history）。共有されたルームの履歴を閲覧専用で表示する */
export function ChatSharedHistoryPage() {
  const { roomId = null } = useParams<{ roomId: string }>();
  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);
  const showViewer = messages.some((message) => message.role === 'assistant');

  useEffect(() => {
    if (roomId) useChatStore.getState().selectRoom(roomId);
  }, [roomId]);

  return (
    <div className="flex h-screen! overflow-hidden bg-white w-full">
      {isLoading ? (
        <div className="chat-main">
          <Loading />
        </div>
      ) : (
        <>
          <ChatWindow isReadOnly roomId={roomId} messages={messages} />
          {showViewer && <ChatDataPanel roomId={roomId} />}
        </>
      )}
    </div>
  );
}
