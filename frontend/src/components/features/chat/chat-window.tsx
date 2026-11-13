import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/components/shared/use-is-mobile';
import { useAssistants } from '@/hooks/use-assistants';
import { useChatActions } from '@/hooks/use-chat-actions';
import type { ChatSendPayload } from '@/hooks/use-chat-input-controls';
import { setPendingMessage } from '@/lib/chat/pending-message';
import { ROUTES } from '@/lib/constants/routes';
import { useChatStore, useActiveRoom } from '@/store/chat-store';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { Message } from '@/types/chat/message.type';
import type { ChatDataPanel } from './chat-data-panel';
import { ChatAssistantExam } from './chat-assistant-exam';
import { chatAttachmentSlots } from './chat-attachment-slots';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { renderChatSummary } from './render-chat-summary';
import { CHAT_INPUT_SLOTS } from './chat-input-slots';
import { ChatMessageList } from './chat-message-list';
import { ChatRenameDialog } from './chat-rename-dialog';
import type { RatingDirection } from './chat-message-item';
import { useChatRoomDialogs } from './use-chat-room-dialogs';

/** 新規チャットでアシスタントが未選択のまま送ったときに使うアシスタント ID（移植元と同じ） */
const FALLBACK_ASSISTANT_ID = 'default';

type ChatInputSlots = Pick<
  ComponentProps<typeof ChatInput>,
  | 'renderDropzone'
  | 'renderAttachments'
  | 'renderMention'
  | 'renderAddMenu'
  | 'renderToolbar'
  | 'onDropFiles'
  | 'onTextareaKeyDown'
>;

interface ChatWindowProps {
  messages: Message[];
  isLoading?: boolean;
  roomId?: string | null;
  showHeader?: boolean;
  isReadOnly?: boolean;
  /** アシスタント試験画面（`/chat/assistant`）。メッセージ一覧の代わりに回答の見本を出し、ヘッダーのルーム名を隠す */
  isChatExamList?: boolean;
  /** ヘッダーの「共有」。未指定なら共有ダイアログを開く（#287） */
  onShareClick?: () => void;
  /** ヘッダーの「評価」。未指定なら評価ダイアログを開く（#287） */
  onLikeClick?: () => void;
  /** 入力欄に別 Issue の部品を差し込む口（#286）。添付（#287）は既定で入る */
  inputSlots?: ChatInputSlots;
  /** モバイルで開くビューワー（移植元の `<app-chat-summary>`）。未指定なら `ChatSummary` */
  renderViewer?: ComponentProps<typeof ChatDataPanel>['renderSummary'];
}

/** 移植元 `<app-chat-window>`。ヘッダー・メッセージ一覧・入力欄を並べ、送信や各操作を store へつなぐ */
export function ChatWindow({
  messages,
  isLoading = false,
  roomId = null,
  showHeader = true,
  isReadOnly = false,
  isChatExamList = false,
  onShareClick,
  onLikeClick,
  inputSlots,
  renderViewer = renderChatSummary,
}: ChatWindowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: assistants } = useAssistants();
  const { createNewRoom, rateMessage } = useChatActions();
  const activeRoom = useActiveRoom();
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const roomDialogs = useChatRoomDialogs({ isReadOnly });

  const viewerRoomId = roomId ?? activeRoom?.id ?? null;
  const assistantDescription = activeRoom?.defaultAssistantId
    ? ((assistants ?? []).find((a) => a.id === activeRoom.defaultAssistantId)?.description ?? '')
    : '';

  // モバイルのビューワーを開いている間は背面をスクロールさせない
  useEffect(() => {
    if (!showDataPanel) return;
    // ほかのダイアログが背面のスクロールを止めていても壊さないよう、開いている間だけ触る
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showDataPanel]);

  // PC 幅に戻ったらモバイル用のビューワーは閉じる
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isMobile) setShowDataPanel(false);
  }, [isMobile]);

  const handleSend = async (data: ChatSendPayload) => {
    const options = {
      assistantId: data.assistantId ?? undefined,
      useWebSearch: data.useWebSearch,
      additionalPrompt: data.additionalPrompt,
      createLibrary: data.createLibrary,
    };

    // ルームがなければ、先に作って移動し、移動先の画面で送る（移植元と同じ）
    if (!roomId) {
      let newRoomId: string | null;
      try {
        newRoomId = await createNewRoom(data.assistantId ?? FALLBACK_ASSISTANT_ID);
      } catch (error) {
        console.error('Create room failed', error);
        return;
      }
      if (!newRoomId) return;

      useChatStore.getState().setActiveRoomId(newRoomId);
      setPendingMessage(newRoomId, { content: data.content, files: data.files, options });
      void navigate(ROUTES.APP.CHAT_ROOM(newRoomId));
      return;
    }

    await useMessagesStore
      .getState()
      .sendMessage(data.content, data.files, useChatStore.getState().activeRoomId, [], options);
  };

  const handleEditSubmit = ({ messageId, newText }: { messageId: string; newText: string }) => {
    void useMessagesStore
      .getState()
      .editMessage(messageId, newText, useChatStore.getState().activeRoomId);
  };

  const handleRate = ({ messageId, rating }: { messageId: string; rating: RatingDirection }) => {
    rateMessage(messageId, rating === 'up' ? 'GOOD' : 'BAD').catch((error: unknown) => {
      console.error('Rate message failed', error);
    });
  };

  const handleRename = (newName: string) => {
    setIsRenameOpen(false);
    if (!activeRoom || newName === activeRoom.name) return;
    useRoomsStore
      .getState()
      .renameRoom(activeRoom.id, newName)
      .catch((error: unknown) => {
        console.error('Rename room failed', error);
      });
  };

  const viewerSlot: ReactNode = renderViewer({
    roomId: viewerRoomId,
    isReadOnly,
    onCollapseChange: (collapsed) => {
      if (collapsed) setShowDataPanel(false);
    },
  });

  return (
    <div className="chat-main">
      <ChatHeader
        // ルームがないときのタイトルは非表示だが、移植元が日本語をハードコードしているのでそのまま移す
        title={activeRoom ? activeRoom.name : '受信メッセージパターン'}
        isReadOnly={isReadOnly}
        isHideName={!(showHeader && !!activeRoom) || isChatExamList}
        onRenameClick={() => {
          if (activeRoom) setIsRenameOpen(true);
        }}
        onShareClick={onShareClick ?? roomDialogs.onShareClick}
        onLikeClick={onLikeClick ?? roomDialogs.onLikeClick}
        onSettingsClick={() => setShowDataPanel((show) => !show)}
      />

      {isChatExamList ? (
        <div className="chat-page-messages">
          <ChatAssistantExam />
        </div>
      ) : (
        <ChatMessageList
          messages={messages}
          isLoading={isLoading}
          isReadOnly={isReadOnly}
          isNewChat={!activeRoom}
          assistantDescription={assistantDescription}
          onRegenerate={(messageId) => void useMessagesStore.getState().regenerateMessage(messageId)}
          onDelete={(messageId) => void useMessagesStore.getState().deleteMessage(messageId)}
          onRate={handleRate}
          onEditSubmit={handleEditSubmit}
        />
      )}

      {!isReadOnly && (
        <ChatInput
          roomId={roomId ?? activeRoom?.id ?? null}
          defaultAssistantId={activeRoom?.defaultAssistantId ?? null}
          onSend={(data) => void handleSend(data)}
          {...chatAttachmentSlots}
          {...CHAT_INPUT_SLOTS}
          {...inputSlots}
        />
      )}

      {roomDialogs.dialogs}

      {isRenameOpen && activeRoom && (
        <ChatRenameDialog
          initialName={activeRoom.name}
          onSave={handleRename}
          onCancel={() => setIsRenameOpen(false)}
        />
      )}

      {showDataPanel && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('CHAT.VIEWER.TITLE')}
        >
          <div
            className="absolute inset-0 bg-black/20"
            aria-hidden="true"
            onClick={() => setShowDataPanel(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white flex flex-col overflow-hidden"
            style={{ height: 'calc(100dvh - 44px)', boxShadow: 'var(--shadow-half-modal)' }}
          >
            {viewerSlot}
          </div>
        </div>
      )}
    </div>
  );
}
