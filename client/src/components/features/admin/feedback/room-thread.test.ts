import { describe, expect, test } from 'vitest';
import type { MessageListApiItem } from '@/types/chat/message-api.type';
import { selectVisibleThread } from './room-thread';

function record(id: string, parentId: string | null): MessageListApiItem {
  return { id, roomId: 'room-1', assistantId: 'a1', parentId, isRated: false };
}

describe('selectVisibleThread', () => {
  test('ids of a linear conversation are returned in order', () => {
    // 根 → m1 → m2 → m3 の一本道は、そのままの順で返る
    const thread = selectVisibleThread([
      record('m1', null),
      record('m2', 'm1'),
      record('m3', 'm2'),
    ]);

    expect(thread.map((r) => r.id)).toEqual(['m1', 'm2', 'm3']);
  });

  test('latest sibling is chosen at each level when versions exist', () => {
    // m1 を編集して m1b を作った（どちらも根の子）。m2 は古い版 m1 の子、m3 は新しい版 m1b の子
    const records = [
      record('m1', null),
      record('m2', 'm1'),
      record('m1b', null),
      record('m3', 'm1b'),
    ];

    expect(selectVisibleThread(records).map((r) => r.id)).toEqual(['m1b', 'm3']);
  });

  test('empty list returns empty thread', () => {
    expect(selectVisibleThread([])).toEqual([]);
  });

  test('cyclic parent links stop at the number of records', () => {
    // m1 の親が m2、m2 の親が m1 の循環。根がないので 0 件で止まる
    const records = [record('m1', 'm2'), record('m2', 'm1')];

    expect(selectVisibleThread(records)).toEqual([]);
  });

  test('self parent link does not loop forever', () => {
    // 根の子 m1 と、自分自身を親にした m2。段数はメッセージ数までで止まる
    const records = [record('m1', null), record('m2', 'm2')];

    expect(selectVisibleThread(records).map((r) => r.id)).toEqual(['m1']);
  });
});
