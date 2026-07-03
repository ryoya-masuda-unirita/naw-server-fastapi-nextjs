import { Assistant } from '@app-types/chat/assistant.type';
import {
  buildFirstMessageRenameName,
  deriveRoomNameFromMessage,
  isPlaceholderRoomName,
  isValidRoomName,
  normalizeRoomName,
} from './room-name.helpers';

const assistants: Assistant[] = [
  {
    id: 'asst-001',
    name: '社内情報アシスタント',
    description: 'desc',
    category: '一般',
    model: 'gpt-4o',
    isDefault: true,
  },
];

describe('deriveRoomNameFromMessage', () => {
  test('改行と連続空白を正規化すること', () => {
    expect(deriveRoomNameFromMessage('  営業資料について\n教えて  ')).toBe(
      '営業資料について 教えて',
    );
  });

  test('50文字を超える場合に省略記号を付けること', () => {
    const content = 'あ'.repeat(51);
    expect(deriveRoomNameFromMessage(content)).toBe(`${'あ'.repeat(50)}…`);
  });
});

describe('normalizeRoomName', () => {
  test('前後の空白を除去すること', () => {
    expect(normalizeRoomName('  営業資料  ')).toBe('営業資料');
  });
});

describe('isValidRoomName', () => {
  test('空文字の場合 false であること', () => {
    expect(isValidRoomName('')).toBe(false);
  });

  test('空白のみの場合 false であること', () => {
    expect(isValidRoomName('   ')).toBe(false);
  });

  test('文字を含む場合 true であること', () => {
    expect(isValidRoomName(' 重要案件 ')).toBe(true);
  });
});

describe('isPlaceholderRoomName', () => {
  test('空文字の場合 true であること', () => {
    expect(isPlaceholderRoomName('', 'asst-001', assistants)).toBe(true);
  });

  test('defaultAssistantId の名前と一致する場合 true であること', () => {
    expect(isPlaceholderRoomName('社内情報アシスタント', 'asst-001', assistants)).toBe(true);
  });

  test('手動変更済みの名前の場合 false であること', () => {
    expect(isPlaceholderRoomName('重要案件', 'asst-001', assistants)).toBe(false);
  });
});

describe('buildFirstMessageRenameName', () => {
  test('初回送信かつ仮名の場合、ルーム名候補を返すこと', () => {
    expect(
      buildFirstMessageRenameName({
        roomId: 'room-1',
        content: '営業資料について教えて',
        messageCount: 0,
        recordCount: 0,
        roomName: '社内情報アシスタント',
        defaultAssistantId: 'asst-001',
        assistants,
      }),
    ).toBe('営業資料について教えて');
  });

  test('2通目以降は null を返すこと', () => {
    expect(
      buildFirstMessageRenameName({
        roomId: 'room-1',
        content: '2通目',
        messageCount: 2,
        recordCount: 1,
        roomName: '社内情報アシスタント',
        defaultAssistantId: 'asst-001',
        assistants,
      }),
    ).toBeNull();
  });

  test('本文が空の場合 null を返すこと', () => {
    expect(
      buildFirstMessageRenameName({
        roomId: 'room-1',
        content: '   ',
        messageCount: 0,
        recordCount: 0,
        roomName: '',
        defaultAssistantId: 'asst-001',
        assistants,
      }),
    ).toBeNull();
  });
});
