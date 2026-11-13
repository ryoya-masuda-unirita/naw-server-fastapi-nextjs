import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ChatDataPanel } from '@/components/features/chat/chat-data-panel';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { Loading } from '@/components/shared/loading';
import { ROUTES } from '@/lib/constants/routes';
import { useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';
import { useSharesStore } from '@/store/shares-store';

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to={ROUTES.APP.CHAT_NEW}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 rounded-lg transition-colors"
    >
      <MatIcon name="subdirectory_arrow_left" size={24} />
      {t('COMMON.BACK')}
    </Link>
  );
}

/**
 * `/chat/share/:shareId`（移植元 features/chat/pages/chat-shared）。共有リンクで開く、閲覧専用のチャット。
 * チームに所属していないなど、共有情報が取れないときは閲覧できない旨を出す。
 *
 * 移植元は共有が編集可（`access.isReadOnly` が false）でも、ChatWindow・ChatDataPanel に常に `isReadOnly=true` を渡す。
 */
export function ChatSharedPage() {
  const { t } = useTranslation();
  const { shareId = null } = useParams<{ shareId: string }>();
  const messages = useVisibleMessages();
  const isMessagesLoading = useMessagesStore((s) => s.isLoading);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!shareId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      setHasAccess(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasAccess(false);
    void (async () => {
      try {
        const access = await useSharesStore.getState().resolveShareAccess(shareId);
        if (cancelled) return;
        setHasAccess(true);
        setRoomId(access.roomId);
        await useChatStore.getState().openSharedRoom(access, shareId);
      } catch {
        if (cancelled) return;
        setHasAccess(false);
        useChatStore.getState().clearSharedRoomContext();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => () => useChatStore.getState().clearSharedRoomContext(), []);

  if (isLoading) {
    return (
      <div className="flex w-full h-full">
        <div className="flex-1 flex items-center justify-center bg-white w-full">
          <Loading />
        </div>
      </div>
    );
  }

  if (hasAccess) {
    return (
      <div className="flex w-full h-full">
        <aside className="w-[260px] bg-gray-50 border-r border-gray-200 flex flex-col min-h-screen">
          <div className="p-4 whitespace-nowrap">
            <BackLink />
          </div>
        </aside>

        <div className="flex-1 flex flex-col h-auto">
          <ChatWindow
            showHeader
            roomId={roomId}
            isReadOnly
            messages={messages}
            isLoading={isMessagesLoading}
          />
        </div>

        <ChatDataPanel roomId={roomId} isReadOnly />
      </div>
    );
  }

  return (
    <div className="flex w-full h-full">
      <aside className="w-[260px] bg-[#F4F4F4] border-r border-gray-200 flex flex-col min-h-screen">
        <div className="p-4">
          <BackLink />
        </div>
      </aside>

      <div className="flex-1 flex flex-col items-center justify-center px-8 bg-white">
        <div className="mb-8">
          <img src="/logo-short.png" alt="Logo" className="w-auto h-20" />
        </div>

        <p className="text-base text-gray-700 text-center">{t('CHAT.SHARED.NO_ACCESS')}</p>
      </div>
    </div>
  );
}
