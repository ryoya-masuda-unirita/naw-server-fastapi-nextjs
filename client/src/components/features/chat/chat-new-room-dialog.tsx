import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { SkeletonBlock } from '@/components/shared/skeleton';
import { useAssistants } from '@/hooks/use-assistants';

interface ChatNewRoomDialogProps {
  /** 作成。選んだアシスタントの ID を渡す */
  onCreate: (assistantId: string) => void;
  onCancel: () => void;
}

/**
 * 移植元 `ChatWindowComponent.createNewChat` と `<app-chat-new-room-dialog>`。アシスタントを選んでルームを作る。
 * 移植元でも、これを開くヘッダーの「新しいチャット」ボタンはコメントアウトされていて画面からは開けない。
 */
export function ChatNewRoomDialog({ onCreate, onCancel }: ChatNewRoomDialogProps) {
  const { t } = useTranslation();
  const { data, isPending } = useAssistants();
  const assistants = data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 一覧が届いたら、既定のアシスタント（なければ先頭）を選んでおく
  useEffect(() => {
    if (!data || selectedId) return;
    const defaultAssistant = data.find((a) => a.isDefault) ?? data[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (defaultAssistant) setSelectedId(defaultAssistant.id);
  }, [data, selectedId]);

  return (
    <Dialog
      open
      title={t('CHAT.WINDOW.CREATE_ROOM_TITLE')}
      showClose={false}
      cancelText={t('COMMON.CANCEL')}
      confirmText={t('COMMON.CREATE')}
      showCancel
      showConfirm
      dialogWidth="480px"
      onCancel={onCancel}
      onConfirm={() => onCreate(selectedId ?? '')}
      onClose={onCancel}
    >
      <fieldset className="block">
        <div className="fieldset-head mb-3">
          <p className="fieldset-title">{t('CHAT.INPUT.NEW_CHAT_DIALOG_TITLE')}</p>
          <p className="fieldset-support-text mt-1">{t('CHAT.INPUT.NEW_CHAT_DIALOG_DESC')}</p>
        </div>

        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {isPending ? (
            <SkeletonBlock length={4} />
          ) : (
            assistants.map((assistant) => {
              const selected = assistant.id === selectedId;
              return (
                <button
                  key={assistant.id}
                  type="button"
                  className="dl-option dl-option--rich text-left"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected ? 'true' : undefined}
                  onClick={() => setSelectedId(assistant.id)}
                >
                  <div className="dl-option__body">
                    <div className="dl-option__head">
                      <span className="dl-option__check" aria-hidden="true">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                          aria-hidden="true"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          <path
                            d="M7.33021 13.2307L3.85521 9.75573L2.67188 10.9307L7.33021 15.5891L17.3302 5.58906L16.1552 4.41406L7.33021 13.2307Z"
                            fill="currentColor"
                          />
                        </svg>
                      </span>
                      <span className="flex-1 min-w-0 truncate text-note font-medium">{assistant.name}</span>
                    </div>
                    {assistant.description && (
                      <div className="dl-option__details">
                        <p className="dl-option__desc">{assistant.description}</p>
                        {assistant.category && <span className="dl-option__category">{assistant.category}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </fieldset>
    </Dialog>
  );
}
