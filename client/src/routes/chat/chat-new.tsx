import { useLayoutEffect } from 'react';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { Loading } from '@/components/shared/loading';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';

/**
 * `/dashboard`・`/chat/new` の新規チャット画面（移植元 features/chat/pages/chat-new の ChatNewComponent）。
 * 開くたびに新規チャットの状態（ルームなし・メッセージなし）にする。最初のメッセージを送ると
 * ルームを作って `/chat/:roomId` へ移り、そこで送信する（ChatWindow）。
 */
export function ChatNewPage() {
  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);

  // 描画の前に空にして、前のルームの会話が一瞬見えないようにする
  useLayoutEffect(() => {
    useChatStore.getState().startNewChat();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-white w-full">
      {isLoading ? (
        <div className="chat-main">
          <Loading />
        </div>
      ) : (
        <ChatWindow isLoading={isLoading} messages={messages} roomId={null} />
      )}
    </div>
  );
}
