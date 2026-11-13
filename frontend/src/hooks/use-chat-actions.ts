import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useAssistants } from '@/hooks/use-assistants';
import type { MessageFeedbackRating } from '@/types/chat/message.type';
import type { RoomFeedbackRequest } from '@/types/chat/chat-room.type';

/** query key の 2 番目。フィードバック管理画面の一覧（移植元 isFeedbackListQuery / isMessageFeedbackListQuery） */
const MESSAGE_FEEDBACK_KINDS = ['accuracy', 'users'];
const ROOM_FEEDBACK_KINDS = ['accuracy', 'satisfaction', 'users'];

function isFeedbackQuery(queryKey: readonly unknown[], kinds: string[]): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'feedback' &&
    typeof queryKey[1] === 'string' &&
    kinds.includes(queryKey[1])
  );
}

/**
 * messages・rooms の store だけでは足りない、アシスタント一覧と query cache が要る操作をまとめる。
 * チャット画面（#284）はこの hook を 1 回呼ぶ。
 *
 * - アシスタント一覧を messages store へ渡す（ルーム名の自動変更・SECURE の model に使う）
 * - 新規ルーム作成にアシスタント名を渡す
 * - 評価の送信後に、フィードバック管理画面の一覧を取り直す（移植元と同じ）
 */
export function useChatActions() {
  const queryClient = useQueryClient();
  const { data: assistants } = useAssistants();
  const setAssistantCatalog = useMessagesStore((s) => s.setAssistantCatalog);

  useEffect(() => {
    setAssistantCatalog(assistants ?? []);
  }, [assistants, setAssistantCatalog]);

  const createNewRoom = useCallback(
    (assistantId: string) =>
      useRoomsStore.getState().createNewRoom(assistantId, assistants ?? []),
    [assistants],
  );

  const rateMessage = useCallback(
    async (messageId: string, rating: MessageFeedbackRating) => {
      await useMessagesStore.getState().rateMessage(messageId, rating);
      await queryClient.invalidateQueries({
        predicate: (query) => isFeedbackQuery(query.queryKey, MESSAGE_FEEDBACK_KINDS),
      });
    },
    [queryClient],
  );

  const submitRoomFeedback = useCallback(
    async (roomId: string, body: RoomFeedbackRequest) => {
      await useRoomsStore.getState().submitRoomFeedback(roomId, body);
      void queryClient.refetchQueries({
        predicate: (query) => isFeedbackQuery(query.queryKey, ROOM_FEEDBACK_KINDS),
      });
    },
    [queryClient],
  );

  return useMemo(
    () => ({ createNewRoom, rateMessage, submitRoomFeedback }),
    [createNewRoom, rateMessage, submitRoomFeedback],
  );
}
