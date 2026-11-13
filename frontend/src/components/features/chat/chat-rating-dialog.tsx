import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormRadio, type FormRadioOption } from '@/components/shared/form-radio';
import { useChatActions } from '@/hooks/use-chat-actions';
import { RATING_MAP, REVERSE_RATING_MAP } from '@/lib/constants/chat-rating';
import { useRoomsStore } from '@/store/rooms-store';
import type { RoomFeedbackRating } from '@/types/chat/chat-room.type';

const RATING_OPTIONS: FormRadioOption<number>[] = [
  { value: 5, label: '★★★★★' },
  { value: 4, label: '★★★★☆' },
  { value: 3, label: '★★★☆☆' },
  { value: 2, label: '★★☆☆☆' },
  { value: 1, label: '★☆☆☆☆' },
];

interface ChatRatingDialogProps {
  /** 評価するルーム。ルームがなければ送信は何もしない（移植元と同じ） */
  roomId: string | undefined;
  /** ルームに付いている評価。あれば初期選択にする */
  existingRating: RoomFeedbackRating | undefined;
  onClose: () => void;
}

/** 移植元 `ChatWindowComponent.openRatingDialog` と `<app-chat-rating-dialog>`。ルーム全体の満足度評価 */
export function ChatRatingDialog({ roomId, existingRating, onClose }: ChatRatingDialogProps) {
  const { t } = useTranslation();
  const { submitRoomFeedback } = useChatActions();
  const isSubmitting = useRoomsStore((s) => s.isSubmittingFeedback);
  const [selectedRating, setSelectedRating] = useState<number | null>(
    existingRating != null ? (REVERSE_RATING_MAP[existingRating] ?? null) : null,
  );

  const handleSubmit = () => {
    if (selectedRating === null) return;
    const apiRating = RATING_MAP[selectedRating];
    if (!apiRating || !roomId) return;

    // API の応答を待つ間はダイアログを開いたままにし、確認ボタンのローディングで示す。失敗したら開いたまま
    submitRoomFeedback(roomId, { rating: apiRating }).then(onClose, (error: unknown) => {
      console.error('Submit room feedback failed', error);
    });
  };

  return (
    <Dialog
      open
      title={t('CHAT.RATING_DIALOG.TITLE')}
      showClose={false}
      showCancel
      showConfirm
      buttonAlign="right"
      cancelText={t('CHAT.RATING_DIALOG.CANCEL')}
      confirmText={t('CHAT.RATING_DIALOG.SUBMIT')}
      confirmMinWidth="min-w-24.5"
      confirmLoading={isSubmitting}
      dialogWidth="800px"
      onCancel={onClose}
      onConfirm={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div>
          <p className="fieldset-title">{t('CHAT.RATING_DIALOG.RATING_LABEL')}</p>
          <p className="fieldset-support-text">{t('CHAT.RATING_DIALOG.SUPPORT_TEXT')}</p>
        </div>

        <FormRadio
          options={RATING_OPTIONS}
          value={selectedRating}
          name="rating"
          classOption="gap-2 flex-col!"
          inputClass="gap-2"
          onValueChange={setSelectedRating}
        />
      </div>
    </Dialog>
  );
}
