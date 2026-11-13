import { ChatWindow } from '@/components/features/chat/chat-window';
import { Loading } from '@/components/shared/loading';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';

/**
 * `/chat/assistant` のアシスタント試験画面（移植元 features/admin/chat-assistant の ChatAssistantComponent）。
 * 回答の見た目の見本（ChatAssistantExam）をメッセージ一覧の代わりに出し、入力欄は通常のチャットと同じものを出す。
 * ルームは選ばない（移植元はルートに roomId がないため `selectRoom` を呼ばない）。
 */
export function ChatAssistantPage() {
  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);

  return (
    <div className="flex h-screen overflow-hidden bg-white w-full">
      {isLoading ? (
        <div className="chat-main">
          <Loading />
        </div>
      ) : (
        <ChatWindow isLoading={isLoading} messages={messages} roomId={null} isChatExamList />
      )}
    </div>
  );
}
