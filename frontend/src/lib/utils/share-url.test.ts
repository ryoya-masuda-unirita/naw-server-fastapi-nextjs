import { describe, expect, test } from 'vitest';
import type { RoomsListApiResponse } from '@/types/chat/chat-room.type';
import { getRoomListTotalCount } from './room-list-mapper';
import { buildShareUrl, parseShareIdFromShareUrl } from './share-url';

describe('buildShareUrl', () => {
  test('origin を指定するとその origin で共有 URL を作ること', () => {
    expect(buildShareUrl('s1', 'https://example.com')).toBe('https://example.com/chat/share/s1');
  });

  test('origin を省略すると現在の origin を使い、parseShareIdFromShareUrl で元の ID に戻せること', () => {
    const url = buildShareUrl('s1');

    expect(url).toBe(`${window.location.origin}/chat/share/s1`);
    expect(parseShareIdFromShareUrl(url)).toBe('s1');
  });
});

describe('getRoomListTotalCount', () => {
  const base: RoomsListApiResponse = { content: [] };

  test('total を最優先し、なければ totalElements、なければ content の件数を返すこと', () => {
    const content = [{} as RoomsListApiResponse['content'][number]];

    expect(getRoomListTotalCount({ ...base, content, total: 9, totalElements: 5 })).toBe(9);
    expect(getRoomListTotalCount({ ...base, content, totalElements: 5 })).toBe(5);
    expect(getRoomListTotalCount({ ...base, content })).toBe(1);
  });
});
