import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type {
  MessageContentApiItem,
  MessageContentsApiResponse,
  MessageListApiItem,
  MessageListAssistant,
  MessagesListApiResponse,
} from '@/types/chat/message-api.type';
import {
  resolveAssistantEndpoint,
  type InvalidEndpointReason,
} from './message-content-endpoint';

export type ContentFetchFailureReason =
  | InvalidEndpointReason
  | 'assistant_not_found'
  | 'fetch_failed';

export interface ContentFetchFailure {
  messageIds: string[];
  reason: ContentFetchFailureReason;
}

export interface FetchContentsResult {
  contents: MessageContentApiItem[];
  failures: ContentFetchFailure[];
}

interface NawPartition {
  kind: 'naw';
  messageIds: string[];
}

interface LocalPartition {
  kind: 'local';
  assistantId: string;
  messageIds: string[];
  contentsUrl: string;
  apiKey: string;
}

interface InvalidPartition {
  kind: 'invalid';
  assistantId: string;
  messageIds: string[];
  reason: ContentFetchFailureReason;
}

type ContentPartition = NawPartition | LocalPartition | InvalidPartition;

/**
 * メッセージ一覧（GET /api/messages）の各メッセージの本文を取得する（移植元 MessageContentsApiService.fetchContents）。
 * アシスタントごとに取得先を分け、NAW は POST /api/messages/contents、SECURE はローカルサーバーへ送る。
 * 一部が失敗しても全体は失敗にせず、失敗分は ERROR のプレースホルダーにして `failures` で返す。
 */
export async function fetchMessageContents(
  listData: MessagesListApiResponse,
): Promise<FetchContentsResult> {
  const messages = listData.messages ?? [];
  if (messages.length === 0) {
    return { contents: [], failures: [] };
  }

  const orderedMessageIds = messages.map((message) => message.id);
  const partitions = buildPartitions(messages, listData.assistants ?? []);
  const contentsByMessageId = new Map<string, MessageContentApiItem>();
  const failures: ContentFetchFailure[] = [];

  const fetchablePartitions: (NawPartition | LocalPartition)[] = [];

  for (const partition of partitions) {
    if (partition.kind === 'invalid') {
      failures.push({ messageIds: partition.messageIds, reason: partition.reason });
      for (const messageId of partition.messageIds) {
        contentsByMessageId.set(messageId, buildErrorPlaceholder(messageId));
      }
      continue;
    }
    fetchablePartitions.push(partition);
  }

  const settled = await Promise.allSettled(
    fetchablePartitions.map((partition) => fetchPartition(partition)),
  );

  settled.forEach((result, index) => {
    const partition = fetchablePartitions[index];
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        contentsByMessageId.set(item.messageId, item);
      }
      return;
    }

    failures.push({ messageIds: partition.messageIds, reason: 'fetch_failed' });
    for (const messageId of partition.messageIds) {
      contentsByMessageId.set(messageId, buildErrorPlaceholder(messageId));
    }
  });

  const contents = mergeContentsByMessageOrder(
    orderedMessageIds,
    Array.from(contentsByMessageId.values()),
  );

  return { contents, failures };
}

async function fetchPartition(
  partition: NawPartition | LocalPartition,
): Promise<MessageContentApiItem[]> {
  const body = { messageIds: partition.messageIds };

  if (partition.kind === 'naw') {
    return apiClient.post<MessageContentsApiResponse>(API_PATHS.MESSAGES.CONTENTS, body);
  }

  // 絶対 URL はベース URL を付けず、401 でもセッションを破棄しない（api-client の仕様）
  return apiClient.post<MessageContentsApiResponse>(partition.contentsUrl, body, {
    headers: { 'X-Server-Auth-Key': partition.apiKey },
  });
}

function buildPartitions(
  messages: MessageListApiItem[],
  assistants: MessageListAssistant[],
): ContentPartition[] {
  const assistantMap = new Map(assistants.map((assistant) => [assistant.id, assistant]));
  const groups = new Map<string, string[]>();
  const nawMessageIds: string[] = [];

  for (const message of messages) {
    // アシスタントが削除されている（assistantId が null）メッセージも本文取得対象に含める
    if (message.assistantId == null) {
      nawMessageIds.push(message.id);
      continue;
    }
    const messageIds = groups.get(message.assistantId) ?? [];
    messageIds.push(message.id);
    groups.set(message.assistantId, messageIds);
  }

  const partitions: ContentPartition[] = [];

  for (const [assistantId, messageIds] of groups) {
    const assistant = assistantMap.get(assistantId);
    if (!assistant) {
      partitions.push({
        kind: 'invalid',
        assistantId,
        messageIds,
        reason: 'assistant_not_found',
      });
      continue;
    }

    const resolved = resolveAssistantEndpoint(assistant);
    if (resolved.kind === 'naw') {
      nawMessageIds.push(...messageIds);
      continue;
    }

    if (resolved.kind === 'invalid') {
      partitions.push({
        kind: 'invalid',
        assistantId,
        messageIds,
        reason: resolved.reason,
      });
      continue;
    }

    partitions.push({
      kind: 'local',
      assistantId,
      messageIds,
      contentsUrl: resolved.contentsUrl,
      apiKey: resolved.apiKey,
    });
  }

  if (nawMessageIds.length > 0) {
    partitions.unshift({ kind: 'naw', messageIds: nawMessageIds });
  }

  return partitions;
}

export function buildErrorPlaceholder(messageId: string): MessageContentApiItem {
  return {
    id: `error-${messageId}`,
    messageId,
    status: 'ERROR',
    question: null,
    answer: null,
    context: null,
    attachmentFiles: [],
    referencePaths: null,
    isRated: false,
    message: null,
  };
}

function mergeContentsByMessageOrder(
  orderedMessageIds: string[],
  contents: MessageContentApiItem[],
): MessageContentApiItem[] {
  const byMessageId = new Map(contents.map((item) => [item.messageId, item]));
  return orderedMessageIds
    .map((messageId) => byMessageId.get(messageId))
    .filter((item): item is MessageContentApiItem => item != null);
}

export { buildPartitions, mergeContentsByMessageOrder };
