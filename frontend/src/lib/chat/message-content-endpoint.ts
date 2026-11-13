import { CHAT_ASSISTANT_TYPE } from '@/lib/constants/assistant-type';
import type {
  MessageListAssistant,
  MessageListAssistantEndpoint,
} from '@/types/chat/message-api.type';

export type InvalidEndpointReason = 'no_endpoint' | 'missing_destination' | 'missing_api_key';

export type ResolvedEndpoint =
  | { kind: 'naw' }
  | { kind: 'local'; contentsUrl: string; contentUrl: string; apiKey: string }
  | { kind: 'invalid'; reason: InvalidEndpointReason };

const LOCAL_MESSAGE_CONTENTS_PATH = 'api/messages/contents';
const LOCAL_MESSAGE_CONTENT_PATH = 'api/messages/content';

function buildLocalApiUrl(destination: string, path: string): string {
  const base = destination.endsWith('/') ? destination : `${destination}/`;
  return new URL(path, base).href;
}

export function buildLocalMessageContentsUrl(destination: string): string {
  return buildLocalApiUrl(destination, LOCAL_MESSAGE_CONTENTS_PATH);
}

export function buildLocalMessageContentUrl(destination: string): string {
  return buildLocalApiUrl(destination, LOCAL_MESSAGE_CONTENT_PATH);
}

export function findSecureLocalEndpoint(
  assistant: MessageListAssistant,
): MessageListAssistantEndpoint | undefined {
  if (assistant.type !== CHAT_ASSISTANT_TYPE.SECURE) {
    return undefined;
  }

  return assistant.endpoints.find((item) => item.type === 'LOCAL_SERVER') ?? assistant.endpoints[0];
}

/** SECURE ローカル SSE 向け textData.assistantId に設定する model を返す */
export function resolveAssistantModel(assistant: MessageListAssistant): string | undefined {
  const endpoint = findSecureLocalEndpoint(assistant);
  const model = endpoint?.model?.trim() || assistant.model?.trim();
  return model || undefined;
}

export function resolveAssistantEndpoint(assistant: MessageListAssistant): ResolvedEndpoint {
  if (assistant.type !== CHAT_ASSISTANT_TYPE.SECURE) {
    return { kind: 'naw' };
  }

  const endpoint = findSecureLocalEndpoint(assistant);

  if (!endpoint) {
    return { kind: 'invalid', reason: 'no_endpoint' };
  }
  if (!endpoint.destination?.trim()) {
    return { kind: 'invalid', reason: 'missing_destination' };
  }
  if (!endpoint.apiKey?.trim()) {
    return { kind: 'invalid', reason: 'missing_api_key' };
  }

  return {
    kind: 'local',
    contentsUrl: buildLocalMessageContentsUrl(endpoint.destination),
    contentUrl: buildLocalMessageContentUrl(endpoint.destination),
    apiKey: endpoint.apiKey,
  };
}
