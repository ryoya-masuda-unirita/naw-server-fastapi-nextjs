import { useEffect, useRef } from 'react';
import './chat-message-list.css';
import { useMessagesStore, useVersionInfoByMessageId } from '@/store/messages-store';
import type { Message } from '@/types/chat/message.type';
import { ChatMessageItem, type RatingDirection } from './chat-message-item';
import { ChatMessageLogo } from './chat-message-logo';

interface ChatMessageListProps {
  messages: Message[];
  isLoading?: boolean;
  isReadOnly?: boolean;
  isNewChat?: boolean;
  assistantDescription?: string;
  onCopy?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onRate?: (data: { messageId: string; rating: RatingDirection }) => void;
  onEditSubmit?: (data: { messageId: string; newText: string }) => void;
}

/** 移植元 `<app-chat-message-list>`。メッセージの一覧。更新のたびに末尾までスクロールする */
export function ChatMessageList({
  messages,
  isLoading = false,
  isReadOnly = false,
  isNewChat = false,
  assistantDescription = '',
  onCopy,
  onRegenerate,
  onDelete,
  onRate,
  onEditSubmit,
}: ChatMessageListProps) {
  const versionInfoByMessageId = useVersionInfoByMessageId();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 描画が終わってから末尾へ移す（移植元は setTimeout 0）
    const timer = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return <ChatMessageLogo isNewChat={isNewChat} assistantDescription={assistantDescription} />;
  }

  return (
    <div className="chat-page-messages" ref={scrollContainerRef}>
      <div className="chat-page-messages-wrapper">
        {messages.map((message) => {
          const key = message.messageId || message.id;
          const versionInfo = versionInfoByMessageId.get(key) ?? null;
          return (
            <ChatMessageItem
              key={message.id}
              message={message}
              versionInfo={versionInfo}
              isReadOnly={isReadOnly}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
              onRate={onRate}
              onEditSend={(newText) => onEditSubmit?.({ messageId: key, newText })}
              onPrevVersion={() => {
                if (versionInfo) useMessagesStore.getState().switchVersion(versionInfo.groupKey, 'prev');
              }}
              onNextVersion={() => {
                if (versionInfo) useMessagesStore.getState().switchVersion(versionInfo.groupKey, 'next');
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
