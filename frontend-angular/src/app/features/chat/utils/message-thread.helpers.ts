import { Message } from '@app-types/chat/message.type';
import { MessageListApiItem } from '@app-types/chat/message-api.type';

export const ROOT_MESSAGE_GROUP_KEY = '__root__';

export interface MessageVersionInfo {
  groupKey: string;
  current: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
}

export function toMessageGroupKey(parentId: string | null | undefined): string {
  return parentId ?? ROOT_MESSAGE_GROUP_KEY;
}

export function getSiblingRecords(
  records: MessageListApiItem[],
  parentId: string | null | undefined,
): MessageListApiItem[] {
  const normalizedParentId = parentId ?? null;
  return records.filter((record) => (record.parentId ?? null) === normalizedParentId);
}

export function initializeActiveVersionIndex(records: MessageListApiItem[]): Map<string, number> {
  const indexByGroup = new Map<string, number>();
  const seenGroups = new Set<string>();

  for (const record of records) {
    const groupKey = toMessageGroupKey(record.parentId);
    if (seenGroups.has(groupKey)) {
      continue;
    }
    seenGroups.add(groupKey);

    const siblings = getSiblingRecords(records, record.parentId);
    if (siblings.length > 1) {
      indexByGroup.set(groupKey, siblings.length - 1);
    }
  }

  return indexByGroup;
}

export function applyMessageMetadataToMessages(
  messages: Message[],
  records: MessageListApiItem[],
): Message[] {
  const recordByMessageId = new Map(records.map((record) => [record.id, record]));

  return messages.map((message) => {
    const record = recordByMessageId.get(message.messageId);
    return {
      ...message,
      parentId: record?.parentId ?? message.parentId ?? null,
      // 編集・再生成で再利用するメタデータを user/assistant 両メッセージに伝播する
      tools: record?.tools ?? message.tools,
      promptTemplateContent: record?.promptTemplateContent ?? message.promptTemplateContent,
      isCreateLibrary: record?.isCreateLibrary ?? message.isCreateLibrary,
    };
  });
}

export function buildVisibleThread(
  records: MessageListApiItem[],
  allMessages: Message[],
  activeIndexByGroup: Map<string, number>,
): Message[] {
  if (records.length === 0) {
    return allMessages;
  }

  const result: Message[] = [];

  function appendTurn(recordId: string): void {
    const turnMessages = allMessages.filter((message) => message.messageId === recordId);
    const userMessage = turnMessages.find((message) => message.role === 'user');
    const assistantMessages = turnMessages.filter((message) => message.role === 'assistant');

    if (userMessage) {
      result.push(userMessage);
    }

    if (assistantMessages.length > 0) {
      result.push(assistantMessages[assistantMessages.length - 1]);
      return;
    }

    for (const message of turnMessages) {
      if (message.role !== 'user') {
        result.push(message);
      }
    }
  }

  function walk(parentId: string | null): void {
    const siblings = getSiblingRecords(records, parentId);
    if (siblings.length === 0) {
      return;
    }

    const groupKey = toMessageGroupKey(parentId);
    const activeIndex = activeIndexByGroup.get(groupKey) ?? siblings.length - 1;
    const activeRecord = siblings[activeIndex] ?? siblings[siblings.length - 1];
    if (!activeRecord) {
      return;
    }

    appendTurn(activeRecord.id);
    walk(activeRecord.id);
  }

  walk(null);
  return result;
}

export function buildVersionInfoByMessageId(
  records: MessageListApiItem[],
  activeIndexByGroup: Map<string, number>,
): Map<string, MessageVersionInfo> {
  const siblingsByParent = new Map<string | null, MessageListApiItem[]>();

  for (const record of records) {
    const parentId = record.parentId ?? null;
    const siblings = siblingsByParent.get(parentId) ?? [];
    siblings.push(record);
    siblingsByParent.set(parentId, siblings);
  }

  const result = new Map<string, MessageVersionInfo>();

  for (const [parentId, siblings] of siblingsByParent) {
    if (siblings.length <= 1) {
      continue;
    }

    const groupKey = toMessageGroupKey(parentId);
    const activeIndex = activeIndexByGroup.get(groupKey) ?? siblings.length - 1;
    const activeRecord = siblings[activeIndex];
    if (!activeRecord) {
      continue;
    }

    result.set(activeRecord.id, {
      groupKey,
      current: activeIndex + 1,
      total: siblings.length,
      canPrev: activeIndex > 0,
      canNext: activeIndex < siblings.length - 1,
    });
  }

  return result;
}

export function getVersionInfoForUserMessage(
  message: Message,
  records: MessageListApiItem[],
  activeIndexByGroup: Map<string, number>,
): MessageVersionInfo | null {
  if (message.role !== 'user') {
    return null;
  }

  const siblings = getSiblingRecords(records, message.parentId);
  if (siblings.length <= 1) {
    return null;
  }

  const groupKey = toMessageGroupKey(message.parentId);
  const activeIndex = activeIndexByGroup.get(groupKey) ?? siblings.length - 1;
  const activeRecord = siblings[activeIndex];
  if (!activeRecord || activeRecord.id !== message.messageId) {
    return null;
  }

  return {
    groupKey,
    current: activeIndex + 1,
    total: siblings.length,
    canPrev: activeIndex > 0,
    canNext: activeIndex < siblings.length - 1,
  };
}

export function getLastActiveRecordId(
  records: MessageListApiItem[],
  allMessages: Message[],
  activeIndexByGroup: Map<string, number>,
): string | null {
  const visibleMessages = buildVisibleThread(records, allMessages, activeIndexByGroup);

  for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
    const message = visibleMessages[index];
    if (message.messageId) {
      return message.messageId;
    }
  }

  return null;
}

export function collectDescendantRecordIds(
  records: MessageListApiItem[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>([rootId]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      const parentId = record.parentId ?? null;
      if (parentId !== null && ids.has(parentId) && !ids.has(record.id)) {
        ids.add(record.id);
        changed = true;
      }
    }
  }

  return ids;
}

export function adjustActiveVersionIndexAfterDelete(
  activeIndexByGroup: Map<string, number>,
  deletedRecord: MessageListApiItem,
  recordsBeforeDelete: MessageListApiItem[],
  removedRecordIds: Set<string>,
  recordsAfterDelete: MessageListApiItem[],
): Map<string, number> {
  const next = new Map(activeIndexByGroup);

  for (const removedId of removedRecordIds) {
    next.delete(toMessageGroupKey(removedId));
  }

  const groupKey = toMessageGroupKey(deletedRecord.parentId);
  const siblingsBefore = getSiblingRecords(recordsBeforeDelete, deletedRecord.parentId);
  const siblingsAfter = getSiblingRecords(recordsAfterDelete, deletedRecord.parentId);
  const deletedIndex = siblingsBefore.findIndex((record) => record.id === deletedRecord.id);

  if (siblingsAfter.length <= 1) {
    next.delete(groupKey);
    return next;
  }

  const currentIndex = activeIndexByGroup.get(groupKey) ?? siblingsBefore.length - 1;
  let newIndex: number;

  if (deletedIndex === currentIndex) {
    newIndex = siblingsAfter.length - 1;
  } else if (deletedIndex < currentIndex) {
    newIndex = currentIndex - 1;
  } else {
    newIndex = currentIndex;
  }

  next.set(groupKey, Math.min(newIndex, siblingsAfter.length - 1));
  return next;
}
