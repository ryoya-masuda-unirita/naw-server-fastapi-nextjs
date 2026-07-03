import { inject, Injectable } from '@angular/core';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';
import type {
  MessageContentApiItem,
  MessageContentsApiResponse,
  MessageListApiItem,
  MessageListAssistant,
  MessagesListApiResponse,
} from '@app-types/chat/message-api.type';
import {
  resolveAssistantEndpoint,
  type InvalidEndpointReason,
} from '@features/chat/utils/message-content-endpoint.resolver';

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

type NawPartition = {
  kind: 'naw';
  messageIds: string[];
};

type LocalPartition = {
  kind: 'local';
  assistantId: string;
  messageIds: string[];
  contentsUrl: string;
  apiKey: string;
};

type InvalidPartition = {
  kind: 'invalid';
  assistantId: string;
  messageIds: string[];
  reason: ContentFetchFailureReason;
};

type ContentPartition = NawPartition | LocalPartition | InvalidPartition;

@Injectable({ providedIn: 'root' })
export class MessageContentsApiService {
  private readonly api = inject(ApiClientService);

  async fetchContents(listData: MessagesListApiResponse): Promise<FetchContentsResult> {
    const messages = listData.messages ?? [];
    if (messages.length === 0) {
      return { contents: [], failures: [] };
    }

    const orderedMessageIds = messages.map((message) => message.id);
    const partitions = buildPartitions(messages, listData.assistants ?? []);
    const contentsByMessageId = new Map<string, MessageContentApiItem>();
    const failures: ContentFetchFailure[] = [];

    const fetchablePartitions: Array<NawPartition | LocalPartition> = [];

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
      fetchablePartitions.map((partition) => this.fetchPartition(partition)),
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

  private async fetchPartition(
    partition: NawPartition | LocalPartition,
  ): Promise<MessageContentApiItem[]> {
    const body = { messageIds: partition.messageIds };

    if (partition.kind === 'naw') {
      return this.api.post<MessageContentsApiResponse>(API_PATHS.MESSAGES.CONTENTS, body);
    }

    return this.api.postFromCustomUrl<MessageContentsApiResponse>(partition.contentsUrl, body, {
      headers: { 'X-Server-Auth-Key': partition.apiKey },
    });
  }
}

function buildPartitions(
  messages: MessageListApiItem[],
  assistants: MessageListAssistant[],
): ContentPartition[] {
  const assistantMap = new Map(assistants.map((assistant) => [assistant.id, assistant]));
  const groups = new Map<string, string[]>();

  for (const message of messages) {
    const messageIds = groups.get(message.assistantId) ?? [];
    messageIds.push(message.id);
    groups.set(message.assistantId, messageIds);
  }

  const nawMessageIds: string[] = [];
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
