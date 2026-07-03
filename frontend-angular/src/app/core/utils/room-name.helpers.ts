import { Assistant } from '@app-types/chat/assistant.type';

export const DEFAULT_ROOM_NAME_MAX_LENGTH = 50;

export function normalizeRoomName(roomName: string): string {
  return roomName.trim();
}

export function isValidRoomName(roomName: string): boolean {
  return normalizeRoomName(roomName).length > 0;
}

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
