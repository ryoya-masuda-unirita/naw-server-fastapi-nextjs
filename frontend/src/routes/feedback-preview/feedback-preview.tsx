import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChatDataPanel } from '@/components/features/chat/chat-data-panel';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { Loading } from '@/components/shared/loading';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';

/** `/feedback-preview/:roomId`（移植元 features/admin/feedback-preview）。フィードバックの対象ルームを閲覧専用で表示する */
export function FeedbackPreviewPage() {
  const { roomId = null } = useParams<{ roomId: string }>();
  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);
  const showViewer = messages.some((message) => message.role === 'assistant');

  useEffect(() => {
    if (!roomId) return;
    // 移植元と同じく、読み込み表示つきで読み込んだあとに selectRoom でも読み込む
    void useMessagesStore.getState().loadMessagesForRoom(roomId, true);
    useChatStore.getState().selectRoom(roomId);
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
