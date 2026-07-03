import { describe, expect, it } from 'vitest';
import type { Message } from '@app-types/chat/message.type';
import type { MessageListApiItem } from '@app-types/chat/message-api.type';
import {
  adjustActiveVersionIndexAfterDelete,
  buildVersionInfoByMessageId,
  buildVisibleThread,
  collectDescendantRecordIds,
  getSiblingRecords,
  getVersionInfoForUserMessage,
  initializeActiveVersionIndex,
  toMessageGroupKey,
} from './message-thread.helpers';

const records: MessageListApiItem[] = [
  { id: 'msg-1', roomId: 'room-1', assistantId: 'asst-1', parentId: null, isRated: false },
  { id: 'msg-2', roomId: 'room-1', assistantId: 'asst-1', parentId: 'msg-1', isRated: false },
  { id: 'msg-3', roomId: 'room-1', assistantId: 'asst-1', parentId: null, isRated: false },
  { id: 'msg-4', roomId: 'room-1', assistantId: 'asst-1', parentId: 'msg-3', isRated: false },
];

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
    parentId: records.find((record) => record.id === messageId)?.parentId ?? null,
    ...overrides,
  };
}

const allMessages: Message[] = [
  buildMessage('msg-1', 'user'),
  buildMessage('msg-1', 'assistant'),
  buildMessage('msg-2', 'user'),
  buildMessage('msg-2', 'assistant'),
  buildMessage('msg-3', 'user'),
  buildMessage('msg-3', 'assistant'),
  buildMessage('msg-4', 'user'),
  buildMessage('msg-4', 'assistant'),
];

describe('message-thread.helpers', () => {
  it('同一 parentId の兄弟 records を取得すること', () => {
    expect(getSiblingRecords(records, null).map((record) => record.id)).toEqual(['msg-1', 'msg-3']);
  });

  it('最新版を active にした場合 v2 枝の subtree を表示すること', () => {
    const activeIndex = initializeActiveVersionIndex(records);
    const visible = buildVisibleThread(records, allMessages, activeIndex);

    expect(visible.map((message) => `${message.role}:${message.messageId}`)).toEqual([
      'user:msg-3',
      'assistant:msg-3',
      'user:msg-4',
      'assistant:msg-4',
    ]);
  });

  it('v1 を active にすると msg-2 まで表示すること', () => {
    const activeIndex = new Map([[toMessageGroupKey(null), 0]]);
    const visible = buildVisibleThread(records, allMessages, activeIndex);

    expect(visible.map((message) => message.messageId)).toEqual([
      'msg-1',
      'msg-1',
      'msg-2',
      'msg-2',
    ]);
  });

  it('active user にのみ version info を返すこと', () => {
    const activeIndex = initializeActiveVersionIndex(records);
    const activeUser = buildMessage('msg-3', 'user');
    const inactiveUser = buildMessage('msg-1', 'user');

    expect(getVersionInfoForUserMessage(activeUser, records, activeIndex)).toEqual({
      groupKey: '__root__',
      current: 2,
      total: 2,
      canPrev: true,
      canNext: false,
    });
    expect(getVersionInfoForUserMessage(inactiveUser, records, activeIndex)).toBeNull();
  });

  it('buildVersionInfoByMessageId は active user の messageId のみ Map に含めること', () => {
    const activeIndex = initializeActiveVersionIndex(records);
    const versionInfoByMessageId = buildVersionInfoByMessageId(records, activeIndex);

    expect(versionInfoByMessageId.get('msg-3')).toEqual({
      groupKey: '__root__',
      current: 2,
      total: 2,
      canPrev: true,
      canNext: false,
    });
    expect(versionInfoByMessageId.has('msg-1')).toBe(false);
  });

  describe('collectDescendantRecordIds', () => {
    it('削除対象とその子孫 record id を収集すること', () => {
      expect(Array.from(collectDescendantRecordIds(records, 'msg-1')).sort()).toEqual([
        'msg-1',
        'msg-2',
      ]);
      expect(Array.from(collectDescendantRecordIds(records, 'msg-3')).sort()).toEqual([
        'msg-3',
        'msg-4',
      ]);
    });
  });

  describe('adjustActiveVersionIndexAfterDelete', () => {
    const baseRecord = {
      roomId: 'room-1',
      assistantId: 'asst-1',
      isRated: false as const,
    };

    const threeBranchRecords: MessageListApiItem[] = [
      { id: 'branch-a', parentId: null, ...baseRecord },
      { id: 'branch-b', parentId: null, ...baseRecord },
      { id: 'branch-c', parentId: null, ...baseRecord },
      { id: 'child-of-c', parentId: 'branch-c', ...baseRecord },
    ];

    it('表示中の最新枝を削除した場合、残りの最新枝を active にすること', () => {
      const activeIndex = new Map([[toMessageGroupKey(null), 2]]);
      const deletedRecord = threeBranchRecords[2];
      const removedRecordIds = collectDescendantRecordIds(threeBranchRecords, 'branch-c');
      const recordsAfterDelete = threeBranchRecords.filter(
        (record) => !removedRecordIds.has(record.id),
      );

      const nextIndex = adjustActiveVersionIndexAfterDelete(
        activeIndex,
        deletedRecord,
        threeBranchRecords,
        removedRecordIds,
        recordsAfterDelete,
      );

      expect(nextIndex.get(toMessageGroupKey(null))).toBe(1);
      expect(buildVersionInfoByMessageId(recordsAfterDelete, nextIndex).get('branch-b')).toEqual({
        groupKey: '__root__',
        current: 2,
        total: 2,
        canPrev: true,
        canNext: false,
      });
    });

    it('非表示側の枝を削除した場合、表示中の枝の index を補正すること', () => {
      const activeIndex = new Map([[toMessageGroupKey(null), 2]]);
      const deletedRecord = threeBranchRecords[1];
      const removedRecordIds = collectDescendantRecordIds(threeBranchRecords, 'branch-b');
      const recordsAfterDelete = threeBranchRecords.filter(
        (record) => !removedRecordIds.has(record.id),
      );

      const nextIndex = adjustActiveVersionIndexAfterDelete(
        activeIndex,
        deletedRecord,
        threeBranchRecords,
        removedRecordIds,
        recordsAfterDelete,
      );

      expect(nextIndex.get(toMessageGroupKey(null))).toBe(1);
      expect(buildVersionInfoByMessageId(recordsAfterDelete, nextIndex).get('branch-c')).toEqual({
        groupKey: '__root__',
        current: 2,
        total: 2,
        canPrev: true,
        canNext: false,
      });
    });

    it('兄弟が1件だけ残る場合は groupKey を除去すること', () => {
      const twoBranchRecords = threeBranchRecords.slice(0, 2);
      const activeIndex = new Map([[toMessageGroupKey(null), 1]]);
      const deletedRecord = twoBranchRecords[1];
      const removedRecordIds = collectDescendantRecordIds(twoBranchRecords, 'branch-b');
      const recordsAfterDelete = twoBranchRecords.filter(
        (record) => !removedRecordIds.has(record.id),
      );

      const nextIndex = adjustActiveVersionIndexAfterDelete(
        activeIndex,
        deletedRecord,
        twoBranchRecords,
        removedRecordIds,
        recordsAfterDelete,
      );

      expect(nextIndex.has(toMessageGroupKey(null))).toBe(false);
      expect(buildVersionInfoByMessageId(recordsAfterDelete, nextIndex).size).toBe(0);
    });
  });
});
