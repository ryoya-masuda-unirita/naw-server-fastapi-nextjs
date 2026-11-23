import type { MessageContentHistoryItem } from '@/types/chat/message-api.type';
import type { Message } from '@/types/chat/message.type';

const SKIPPED_STATUSES = new Set(['ERROR', 'PENDING']);

function isCompleteTurn(user: Message | undefined, assistant: Message | undefined): boolean {
  const question = user?.question?.trim() ?? '';
  const answer = assistant?.answer?.trim() ?? '';
  if (!question || !assistant || !answer) {
    return false;
  }
  if (SKIPPED_STATUSES.has(assistant.status)) {
    return false;
  }
  return true;
}

function orderedTurnMessageIds(visibleMessages: Message[], excludeMessageId: string): string[] {
  const messageIds: string[] = [];
  const seen = new Set<string>();

  for (const message of visibleMessages) {
    const messageId = message.messageId?.trim();
    if (!messageId || messageId === excludeMessageId || seen.has(messageId)) {
      continue;
    }
    seen.add(messageId);
    messageIds.push(messageId);
  }

  return messageIds;
}

/**
 * 表示中スレッドから textData.historyMessages を組み立てる。
 * excludeMessageId のターンおよび ERROR / PENDING / 空回答ターンは除外する。
 */
export function buildHistoryMessagesFromVisibleThread(
  visibleMessages: Message[],
  excludeMessageId: string,
): MessageContentHistoryItem[] {
  const history: MessageContentHistoryItem[] = [];

  for (const messageId of orderedTurnMessageIds(visibleMessages, excludeMessageId)) {
    const turnMessages = visibleMessages.filter((message) => message.messageId === messageId);
    const user = turnMessages.find((message) => message.role === 'user');
    const assistant = turnMessages.filter((message) => message.role === 'assistant').slice(-1)[0];

    if (!isCompleteTurn(user, assistant)) {
      continue;
    }

    history.push({
      type: 'USER',
      content: user!.question.trim(),
      attachmentsCount: user!.attachmentFiles?.length ?? 0,
    });
    history.push({
      type: 'ASSISTANT',
      content: assistant!.answer.trim(),
      attachmentsCount: 0,
    });
  }

  return history;
}
