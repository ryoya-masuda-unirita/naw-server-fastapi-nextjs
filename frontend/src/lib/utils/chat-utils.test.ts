import { describe, expect, test } from 'vitest';
import type { Assistant } from '@/types/chat/assistant.type';
import type { RoomListApiItem } from '@/types/chat/chat-room.type';
import { parseAssistantsListResponse } from '@/lib/chat/assistants-api-mapper';
import { parseReasoningText } from './reasoning-text';
import {
  buildFirstMessageRenameName,
  deriveRoomNameFromMessage,
  isPlaceholderRoomName,
} from './room-name';
import { mapRoomListApiItemToChatRoom, getRoomListTotalCount } from './room-list-mapper';
import { buildShareUrl, parseShareIdFromShareUrl } from './share-url';

const FIXTURE_ASSISTANTS: Assistant[] = [
  { id: 'a1', name: 'アシスタント1', description: '', category: '', model: '' },
];

describe('parseReasoningText', () => {
  test('見出しごとにセクションへ分けること', () => {
    expect(parseReasoningText('**調べる**\n\n詳細1\n\n**まとめる**\n\n詳細2')).toEqual({
      sections: [
        { summary: '調べる', detail: '詳細1' },
        { summary: 'まとめる', detail: '詳細2' },
      ],
    });
  });

  test('見出しが無ければセクションは空になること', () => {
    expect(parseReasoningText('まだ見出しが無い')).toEqual({ sections: [] });
  });

  test('ストリーミング途中の閉じていない見出しは最後の詳細に含めないこと', () => {
    expect(parseReasoningText('**調べる**\n\n詳細\n\n**まと')).toEqual({
      sections: [{ summary: '調べる', detail: '詳細' }],
    });
  });
});

describe('room-name', () => {
  test('長いメッセージは 50 文字で切って … を付け、空白は 1 つにまとめること', () => {
    expect(deriveRoomNameFromMessage('a  b\n c')).toBe('a b c');
    expect(deriveRoomNameFromMessage('あ'.repeat(60))).toBe(`${'あ'.repeat(50)}…`);
  });

  test('空・既定アシスタント名のままの名前は仮の名前とみなすこと', () => {
    expect(isPlaceholderRoomName('', undefined, [])).toBe(true);
    expect(isPlaceholderRoomName('アシスタント1', 'a1', FIXTURE_ASSISTANTS)).toBe(true);
    expect(isPlaceholderRoomName('自分で付けた名前', 'a1', FIXTURE_ASSISTANTS)).toBe(false);
    expect(isPlaceholderRoomName('アシスタント1', undefined, FIXTURE_ASSISTANTS)).toBe(false);
  });

  describe('buildFirstMessageRenameName', () => {
    const base = {
      roomId: 'r1',
      content: '最初の質問',
      messageCount: 0,
      recordCount: 0,
      roomName: '',
      defaultAssistantId: undefined,
      assistants: FIXTURE_ASSISTANTS,
    };

    test('最初のメッセージで仮の名前なら、内容から作った名前を返すこと', () => {
      expect(buildFirstMessageRenameName(base)).toBe('最初の質問');
    });

    test('ルームが無い・既にメッセージがある・ルーム名が不明・自分で付けた名前のときは null になること', () => {
      expect(buildFirstMessageRenameName({ ...base, roomId: null })).toBeNull();
      expect(buildFirstMessageRenameName({ ...base, messageCount: 1 })).toBeNull();
      expect(buildFirstMessageRenameName({ ...base, recordCount: 1 })).toBeNull();
      expect(buildFirstMessageRenameName({ ...base, roomName: undefined })).toBeNull();
      expect(buildFirstMessageRenameName({ ...base, roomName: '自分の名前' })).toBeNull();
      expect(buildFirstMessageRenameName({ ...base, content: '  ' })).toBeNull();
    });
  });
});

describe('share-url', () => {
  test('共有 URL から shareId を取り出し、無ければ null になること', () => {
    expect(parseShareIdFromShareUrl('https://x.test/chat/share/abc123?x=1')).toBe('abc123');
    expect(parseShareIdFromShareUrl('https://x.test/other')).toBeNull();
    expect(parseShareIdFromShareUrl(null)).toBeNull();
  });

  test('shareId から共有 URL を作ること', () => {
    expect(buildShareUrl('abc', 'https://x.test')).toBe('https://x.test/chat/share/abc');
  });
});

describe('room-list-mapper', () => {
  const api: RoomListApiItem = {
    id: 'r1',
    name: '名前',
    pinned: true,
    createdAt: '',
    updatedAt: '2026-11-01T00:00:00Z',
    tenantId: 't',
    userId: 'u',
    rating: 'GOOD',
    shareUrl: 'https://x.test/chat/share/s1',
    defaultAssistantId: 'a1',
  };

  test('API の項目を ChatRoom にすること', () => {
    expect(mapRoomListApiItemToChatRoom(api)).toEqual({
      id: 'r1',
      name: '名前',
      isPinned: true,
      rating: 'GOOD',
      lastMessage: undefined,
      lastMessageTime: '2026-11-01T00:00:00Z',
      category: 'chat',
      defaultAssistantId: 'a1',
      shareId: 's1',
      teamIds: [],
    });
  });

  test('既存の最終メッセージ・カテゴリ・共有 ID は引き継ぐこと', () => {
    const room = mapRoomListApiItemToChatRoom(api, {
      id: 'r1',
      name: '旧',
      isPinned: false,
      category: 'data',
      lastMessage: '前',
      lastMessageTime: 'T',
      shareId: 'old',
    });
    expect(room).toMatchObject({ lastMessage: '前', lastMessageTime: 'T', category: 'data', shareId: 'old' });
  });

  test('総件数は total → totalElements → 件数の順に使うこと', () => {
    expect(getRoomListTotalCount({ content: [api], total: 9, totalElements: 5 })).toBe(9);
    expect(getRoomListTotalCount({ content: [api], totalElements: 5 })).toBe(5);
    expect(getRoomListTotalCount({ content: [api] })).toBe(1);
  });
});

describe('parseAssistantsListResponse', () => {
  const item = {
    id: 'a1',
    name: 'AzureOpenAI',
    description: null,
    category: null,
    categories: [{ name: '汎用' }],
    endpoints: [
      { model: 'chat-model', type: 'AZURE_OPENAI_CHAT' },
      { model: 'local-model', type: 'LOCAL_SERVER' },
    ],
  };

  test('配列・data・content のどれでも読め、LOCAL_SERVER の model を優先すること', () => {
    const expected = [{ id: 'a1', name: 'AzureOpenAI', description: '', category: '汎用', model: 'local-model' }];
    expect(parseAssistantsListResponse([item])).toEqual(expected);
    expect(parseAssistantsListResponse({ data: [item] })).toEqual(expected);
    expect(parseAssistantsListResponse({ content: [item] })).toEqual(expected);
  });

  test('形が違えば空になること', () => {
    expect(parseAssistantsListResponse(null)).toEqual([]);
    expect(parseAssistantsListResponse({})).toEqual([]);
  });
});
