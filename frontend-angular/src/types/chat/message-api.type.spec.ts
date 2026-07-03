import { describe, expect, test } from 'vitest';
import {
  buildSendMessageTextData,
  mapMessageContentsToMessages,
  MESSAGE_CONTENT_WEB_SEARCH_TOOLS,
  parseCreateMessageId,
  type MessageContentApiItem,
} from './message-api.type';

describe('MESSAGE_CONTENT_WEB_SEARCH_TOOLS', () => {
  test('web_search ツール名のみを含むこと', () => {
    expect(MESSAGE_CONTENT_WEB_SEARCH_TOOLS).toEqual([{ name: 'web_search' }]);
  });
});

describe('buildSendMessageTextData', () => {
  test('未指定のオプション項目は含めないこと', () => {
    const data = buildSendMessageTextData({
      messageId: 'msg-1',
      userInput: 'hello',
    });

    expect(data).toEqual({
      messageId: 'msg-1',
      userInput: 'hello',
    });
    expect(data).not.toHaveProperty('assistantId');
    expect(data).not.toHaveProperty('messageContentId');
    expect(data).not.toHaveProperty('additionalPrompt');
    expect(data).not.toHaveProperty('historyMessages');
    expect(data).not.toHaveProperty('tools');
  });

  test('指定されたオプションのみ含めること', () => {
    const data = buildSendMessageTextData({
      messageId: 'msg-1',
      userInput: 'hello',
      assistantId: 'asst-1',
      additionalPrompt: 'テンプレ',
      tools: [
        { name: 'web_search', server_label: 'lbl', server_url: 'url', require_approval: 'never' },
      ],
    });

    expect(data.assistantId).toBe('asst-1');
    expect(data.additionalPrompt).toBe('テンプレ');
    expect(data.tools).toHaveLength(1);
    expect(data).not.toHaveProperty('messageContentId');
  });
});

describe('parseCreateMessageId', () => {
  test('message id 文字列をそのまま返すこと', () => {
    expect(parseCreateMessageId('5821a6f420f745c0b18c2e31adf73186')).toBe(
      '5821a6f420f745c0b18c2e31adf73186',
    );
  });

  test('{ data: { id } } 形式を解釈できること', () => {
    expect(parseCreateMessageId({ data: { id: 'msg-1' } })).toBe('msg-1');
  });

  test('JSON 文字列ボディを解釈できること', () => {
    expect(parseCreateMessageId('{"data":{"id":"msg-2"}}')).toBe('msg-2');
  });
});

const assistantIdByMessageId = new Map([['msg-1', 'asst-1']]);

function buildContentItem(overrides: Partial<MessageContentApiItem> = {}): MessageContentApiItem {
  return {
    id: 'content-1',
    messageId: 'msg-1',
    status: 'OK',
    question: '質問',
    answer: '回答',
    context: null,
    attachmentFiles: [],
    referencePaths: null,
    isRated: false,
    ...overrides,
  };
}

describe('mapMessageContentsToMessages', () => {
  test('question と answer を含む item から user / assistant の2件に分割されること', () => {
    const messages = mapMessageContentsToMessages([buildContentItem()], assistantIdByMessageId);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: 'msg-1',
      messageId: 'msg-1',
      role: 'user',
      question: '質問',
      isRated: false,
    });
    expect(messages[1]).toMatchObject({
      id: 'content-1',
      messageId: 'msg-1',
      role: 'assistant',
      answer: '回答',
      isRated: false,
      assistantId: 'asst-1',
    });
  });

  test('contents API の isRated は assistant メッセージにのみ反映されること', () => {
    const messages = mapMessageContentsToMessages(
      [buildContentItem({ isRated: true })],
      assistantIdByMessageId,
    );

    expect(messages[0].isRated).toBe(false);
    expect(messages[1].isRated).toBe(true);
  });

  test('answer の改行がそのまま保持されること', () => {
    const messages = mapMessageContentsToMessages(
      [buildContentItem({ answer: '1行目\n2行目' })],
      assistantIdByMessageId,
    );

    expect(messages[1].answer).toBe('1行目\n2行目');
  });

  test('HTML を含む answer はそのまま保持されること', () => {
    const htmlAnswer = '<p>回答</p>';
    const messages = mapMessageContentsToMessages(
      [buildContentItem({ answer: htmlAnswer })],
      assistantIdByMessageId,
    );

    expect(messages[1].answer).toBe(htmlAnswer);
  });

  test('ERROR ステータスでは answer が空でも assistant メッセージが生成されること', () => {
    const messages = mapMessageContentsToMessages(
      [
        buildContentItem({
          answer: null,
          status: 'ERROR',
          message: 'エラー',
          isRated: true,
        }),
      ],
      assistantIdByMessageId,
    );

    expect(messages[1]).toMatchObject({
      role: 'assistant',
      answer: '',
      status: 'ERROR',
      message: 'エラー',
      isRated: true,
    });
  });
});
