export const UNKNOWN_FEEDBACK_ASSISTANT_I18N_KEY = 'CHAT.MESSAGE.UNKNOWN_ASSISTANT';

export function resolveAssistantName(
  assistantName: string | null | undefined,
  unknownLabel: string,
): string {
  return assistantName ?? unknownLabel;
}
