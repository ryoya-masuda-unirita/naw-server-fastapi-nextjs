import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { ChatDataPanel } from '@/components/features/chat/chat-data-panel';
import { ChatWindow } from '@/components/features/chat/chat-window';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { IconButton } from '@/components/shared/icon-button';
import { Loading } from '@/components/shared/loading';
import { ROUTES } from '@/lib/constants/routes';
import { useActiveRoom, useChatStore } from '@/store/chat-store';
import { useMessagesStore, useVisibleMessages } from '@/store/messages-store';

/** 一覧（`chat-history-list`）が `navigate` の state で渡す値。URL を直接開いたときは何もない */
interface ChatHistoryDetailState {
  roomName?: string;
  userName?: string;
  userId?: string;
}

/**
 * 移植元 `AdminChatHistoryDetailComponent`（`/admin/chat-history/:roomId`）。
 * 管理者がユーザーのチャット履歴を読み取り専用で見る画面。離れるときは文脈と表示中のルームを捨てる
 */
export function AdminChatHistoryDetailPage() {
  const { t } = useTranslation();
  const { roomId = null } = useParams<{ roomId: string }>();
  const state = (useLocation().state as ChatHistoryDetailState | null) ?? {};
  const roomName = state.roomName ?? '';
  const { userId, userName } = state;

  const messages = useVisibleMessages();
  const isLoading = useMessagesStore((s) => s.isLoading);
  const loadError = useMessagesStore((s) => s.loadError);
  const activeRoom = useActiveRoom();

  const displayRoomName = activeRoom?.name || roomName;
  const showViewer = messages.some((message) => message.role === 'assistant');

  // 移植元は params の購読の中で行う。roomId が変わったときだけ開き直し、state の変化では読み込み直さない
  useEffect(() => {
    if (!roomId) return;
    useChatStore.getState().openAdminHistoryRoom({ id: roomId, name: roomName, userId, userName });
    void useMessagesStore.getState().loadMessagesForRoom(roomId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(
    () => () => {
      useChatStore.getState().clearAdminHistoryRoomContext();
      useChatStore.getState().startNewChat();
    },
    [],
  );

  const renderMessage = (key: string): ReactNode => (
    <div className="chat-main flex flex-col items-center justify-center gap-4 p-6">
      <p className="text-text-muted">{t(key)}</p>
    </div>
  );

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="chat-main">
        <Loading />
      </div>
    );
  } else if (loadError === 'forbidden') {
    body = renderMessage('CHAT_HISTORY.DETAIL.FORBIDDEN');
  } else if (loadError === 'general') {
    body = renderMessage('CHAT_HISTORY.DETAIL.LOAD_ERROR');
  } else if (messages.length === 0) {
    body = renderMessage('CHAT_HISTORY.DETAIL.EMPTY');
  } else {
    body = (
      <>
        <ChatWindow showHeader={false} isReadOnly roomId={roomId} messages={messages} />
        {showViewer && <ChatDataPanel roomId={roomId} />}
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen! overflow-hidden bg-white w-full">
      <header className="shrink-0 flex items-center gap-1 h-11 md:h-14 px-2 md:px-4 bg-bg-primary z-30">
        <IconButton
          variant="tertiary-gray"
          link={ROUTES.APP.ADMIN_CHAT_HISTORY}
          ariaLabel={t('COMMON.BACK')}
          dataTestid="admin-chat-history-back-button"
        >
          <SvgIcon name="arrowLeft" className="w-5 h-5 text-text-weak" />
        </IconButton>

        <h1 className="chat-page-header-title min-w-0 flex-1">
          {displayRoomName || t('CHAT_HISTORY.TITLE')}
        </h1>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden w-full">{body}</div>
    </div>
  );
}
