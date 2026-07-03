import { Assistant } from '@app-types/chat/assistant.type';

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
