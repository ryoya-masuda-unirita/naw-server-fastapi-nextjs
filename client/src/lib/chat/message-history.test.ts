import { describe, expect, it } from 'vitest';
import type { Message } from '@/types/chat/message.type';
import { buildHistoryMessagesFromVisibleThread } from './message-history';

function buildMessage(
  messageId: string,
  role: Message['role'],
  overrides: Partial<Message> = {},
): Message {
  return {
    id: role === 'user' ? messageId : `${messageId}-assistant`,
    messageId,
    role,
    status: 'OK',
    question: role === 'user' ? `question-${messageId}` : '',
    answer: role === 'assistant' ? `answer-${messageId}` : '',
    context: '',
    attachmentFiles: [],
    referenceFilePaths: [],
    isRated: false,
    ...overrides,
  };
}

describe('buildHistoryMessagesFromVisibleThread', () => {

  it('表示中スレッドの完了ターンを USER / ASSISTANT ペアで返すこと', () => {
    const visibleMessages = [
      buildMessage('msg-1', 'user'),
      buildMessage('msg-1', 'assistant'),
      buildMessage('msg-2', 'user'),
      buildMessage('msg-2', 'assistant'),
    ];

    expect(buildHistoryMessagesFromVisibleThread(visibleMessages, 'msg-3')).toEqual([
      { type: 'USER', content: 'question-msg-1', attachmentsCount: 0 },
      { type: 'ASSISTANT', content: 'answer-msg-1', attachmentsCount: 0 },
      { type: 'USER', content: 'question-msg-2', attachmentsCount: 0 },
      { type: 'ASSISTANT', content: 'answer-msg-2', attachmentsCount: 0 },
    ]);
  });

  it('excludeMessageId のターンを履歴から除外すること', () => {
    const visibleMessages = [
      buildMessage('msg-1', 'user'),
      buildMessage('msg-1', 'assistant'),
      buildMessage('msg-2', 'user'),
      buildMessage('msg-2', 'assistant'),
    ];

    expect(buildHistoryMessagesFromVisibleThread(visibleMessages, 'msg-2')).toEqual([
      { type: 'USER', content: 'question-msg-1', attachmentsCount: 0 },
      { type: 'ASSISTANT', content: 'answer-msg-1', attachmentsCount: 0 },
    ]);
  });

  it('ERROR / PENDING / 空回答ターンを除外すること', () => {
    const visibleMessages = [
      buildMessage('msg-1', 'user'),
      buildMessage('msg-1', 'assistant', { status: 'ERROR', answer: '' }),
      buildMessage('msg-2', 'user'),
      buildMessage('msg-2', 'assistant', { status: 'PENDING', answer: '' }),
      buildMessage('msg-3', 'user'),
      buildMessage('msg-3', 'assistant', { answer: '' }),
      buildMessage('msg-4', 'user'),
      buildMessage('msg-4', 'assistant'),
    ];

    expect(buildHistoryMessagesFromVisibleThread(visibleMessages, 'msg-5')).toEqual([
      { type: 'USER', content: 'question-msg-4', attachmentsCount: 0 },
      { type: 'ASSISTANT', content: 'answer-msg-4', attachmentsCount: 0 },
    ]);
  });

  it('user の attachmentsCount を履歴に反映すること', () => {
    const visibleMessages = [
      buildMessage('msg-1', 'user', {
        attachmentFiles: [{ id: 'f-1', name: 'a.txt', size: 1, type: 'text/plain' }],
      }),
      buildMessage('msg-1', 'assistant'),
    ];

    expect(buildHistoryMessagesFromVisibleThread(visibleMessages, 'msg-2')[0]).toMatchObject({
      type: 'USER',
      attachmentsCount: 1,
    });
  });

  it('assistant answer の HTML をそのまま保持すること', () => {
    const htmlAnswer = '<p>回答</p>';
    const visibleMessages = [
      buildMessage('msg-1', 'user'),
      buildMessage('msg-1', 'assistant', { answer: htmlAnswer }),
    ];

    expect(buildHistoryMessagesFromVisibleThread(visibleMessages, 'msg-2')[1]).toMatchObject({
      type: 'ASSISTANT',
      content: htmlAnswer,
    });
  });

  it('履歴 0 件のとき空配列を返すこと', () => {
    expect(buildHistoryMessagesFromVisibleThread([], 'msg-1')).toEqual([]);
    expect(buildHistoryMessagesFromVisibleThread([buildMessage('msg-1', 'user')], 'msg-1')).toEqual(
      [],
    );
  });
});
