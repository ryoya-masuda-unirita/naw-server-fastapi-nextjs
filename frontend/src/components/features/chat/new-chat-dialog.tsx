import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/button';
import { Dialog } from '@/components/shared/dialog';
import { SelectWithSearch } from '@/components/shared/select-with-search';
import type { SelectOption } from '@/components/shared/types';
import { useAssistants } from '@/hooks/use-assistants';
import { useChatActions } from '@/hooks/use-chat-actions';
import { ROUTES } from '@/lib/constants/routes';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * サイドバーの「新しいチャット」から開くダイアログ。
 * 移植元 sidebar.component の `openNewChatDialog`・`confirmNewChat` と `<app-new-chat-dialog>`。
 * アシスタントを選んでルームを作り、そのルームの画面へ移る。
 */
export function NewChatDialog({ open, onClose }: NewChatDialogProps) {
  // 開くたびに選択を空に戻すため、開いている間だけ中身をマウントする（移植元は開く前に null へ戻す）
  if (!open) return null;
  return <NewChatDialogContent onClose={onClose} />;
}

function NewChatDialogContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useAssistants();
  const { createNewRoom } = useChatActions();
  const isCreatingRoom = useRoomsStore((s) => s.isCreatingRoom);
  const [assistantId, setAssistantId] = useState<string | null>(null);

  const options = useMemo<SelectOption<string>[]>(
    () =>
      (data ?? []).map((a) => ({
        label: a.name,
        value: a.id,
        description: a.description,
        category: a.category,
      })),
    [data],
  );

  const confirm = async () => {
    if (!assistantId) return;
    try {
      const newRoomId = await createNewRoom(assistantId);
      if (!newRoomId) return;
      useChatStore.getState().setActiveRoomId(newRoomId);
      onClose();
      void navigate(ROUTES.APP.CHAT_ROOM(newRoomId));
    } catch (error) {
      // 失敗したらダイアログを開いたままにする（移植元と同じ。エラートーストは api-client が出す）
      console.error('Create room failed', error);
    }
  };

  return (
    <Dialog
      open
      title={t('CHAT.WINDOW.CREATE_ROOM_TITLE')}
      buttonAlign="right"
      dialogWidth="800px"
      panelClass="dialog-overflow-visible"
      onClose={onClose}
      customActions={
        <div className="flex w-full justify-center gap-3">
          <Button
            className="dialog-cancel-btn flex-1"
            variant="outline"
            size="lg"
            fullWidth
            onClick={onClose}
          >
            {t('COMMON.CANCEL')}
          </Button>
          <Button
            className="flex-1"
            size="lg"
            fullWidth
            disabled={!assistantId || isCreatingRoom}
            loading={isCreatingRoom}
            onClick={() => void confirm()}
          >
            {t('COMMON.CREATE')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1 max-sm:pt-4">
        <p className="text-sm leading-[1.4] text-text-default font-medium">
          {t('CHAT.INPUT.NEW_CHAT_DIALOG_TITLE')}
        </p>
        <p className="text-xs text-text-muted leading-[1.4] mb-2">{t('CHAT.INPUT.NEW_CHAT_DIALOG_DESC')}</p>
        <SelectWithSearch
          options={options}
          value={assistantId ?? ''}
          supportText={t('CHAT.INPUT.ASSISTANT_SEARCH_HINT')}
          placeholder={t('CHAT.INPUT.NEW_CHAT_PLACEHOLDER')}
          onSelectionChange={setAssistantId}
        />
      </div>
    </Dialog>
  );
}
