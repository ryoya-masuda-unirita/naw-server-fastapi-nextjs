import { useCallback, useState, type ReactNode } from 'react';
import { useActiveRoom } from '@/store/chat-store';
import { ChatRatingDialog } from './chat-rating-dialog';
import { ChatShareDialog } from './chat-share-dialog';

type OpenDialog = 'share' | 'rating' | null;

interface Params {
  isReadOnly: boolean;
}

/**
 * ヘッダーの「共有」「評価」から開くダイアログ（移植元 `ChatWindowComponent.openShareDialog` / `openRatingDialog`）。
 * `onShareClick`・`onLikeClick` を `ChatHeader` へ、`dialogs` を画面のどこかに置く。
 */
export function useChatRoomDialogs({ isReadOnly }: Params): {
  onShareClick: () => void;
  onLikeClick: () => void;
  dialogs: ReactNode;
} {
  const room = useActiveRoom();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const onShareClick = useCallback(() => setOpenDialog('share'), []);
  const onLikeClick = useCallback(() => setOpenDialog('rating'), []);
  const close = useCallback(() => setOpenDialog(null), []);

  const dialogs = (
    <>
      {openDialog === 'share' && <ChatShareDialog isReadOnly={isReadOnly} onClose={close} />}
      {openDialog === 'rating' && (
        <ChatRatingDialog roomId={room?.id} existingRating={room?.rating} onClose={close} />
      )}
    </>
  );

  return { onShareClick, onLikeClick, dialogs };
}
