import type { Assistant } from '@/types/chat/assistant.type';

export const DEFAULT_ROOM_NAME_MAX_LENGTH = 50;

/** 最初のメッセージからルーム名を作る。空白を 1 つにまとめ、長ければ切って `…` を付ける */
export function deriveRoomNameFromMessage(
  content: string,
  maxLength = DEFAULT_ROOM_NAME_MAX_LENGTH,
): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

/** ルーム名が作成時の仮の名前（空、または既定アシスタント名のまま）か */
export function isPlaceholderRoomName(
  roomName: string,
  defaultAssistantId: string | undefined,
  assistants: Assistant[],
): boolean {
  if (!roomName.trim()) {
    return true;
  }

  if (!defaultAssistantId) {
    return false;
  }

  const assistant = assistants.find((item) => item.id === defaultAssistantId);
  return assistant ? roomName === assistant.name : false;
}

/** 最初のメッセージ送信時に付けるルーム名。リネームしない場合は null */
export function buildFirstMessageRenameName(params: {
  roomId: string | null;
  content: string;
  messageCount: number;
  recordCount: number;
  roomName: string | undefined;
  defaultAssistantId: string | undefined;
  assistants: Assistant[];
}): string | null {
  if (!params.roomId || !params.content.trim()) {
    return null;
  }

  if (params.messageCount > 0 || params.recordCount > 0) {
    return null;
  }

  if (params.roomName === undefined) {
    return null;
  }

  if (!isPlaceholderRoomName(params.roomName, params.defaultAssistantId, params.assistants)) {
    return null;
  }

  return deriveRoomNameFromMessage(params.content);
}
