import type { Assistant } from '@/types/chat/assistant.type';

/**
 * 入力欄の初期アシスタント（移植元 resolveInitialAssistant）。
 * ルームの既定アシスタント → 一覧の既定（isDefault）→ 先頭の順で選ぶ。一覧が空なら null。
 */
export function resolveInitialAssistant(
  assistants: Assistant[],
  defaultAssistantId: string | null | undefined,
): Assistant | null {
  if (!assistants.length) {
    return null;
  }

  if (defaultAssistantId) {
    const roomDefault = assistants.find((assistant) => assistant.id === defaultAssistantId);
    if (roomDefault) {
      return roomDefault;
    }
  }

  return assistants.find((assistant) => assistant.isDefault) ?? assistants[0] ?? null;
}
