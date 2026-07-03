import { CHAT_ASSISTANT_TYPE } from '@features/chat/constants/assistant-type.constants';
import type { MessageListAssistant } from '@app-types/chat/message-api.type';

export type InvalidEndpointReason = 'no_endpoint' | 'missing_destination' | 'missing_api_key';

export type ResolvedEndpoint =
  | { kind: 'naw' }
  | { kind: 'local'; contentsUrl: string; apiKey: string }
  | { kind: 'invalid'; reason: InvalidEndpointReason };

const LOCAL_MESSAGE_CONTENTS_PATH = 'api/messages/contents';

export function buildLocalMessageContentsUrl(destination: string): string {
  const base = destination.endsWith('/') ? destination : `${destination}/`;
  return new URL(LOCAL_MESSAGE_CONTENTS_PATH, base).href;
}

export function resolveAssistantEndpoint(assistant: MessageListAssistant): ResolvedEndpoint {
  if (assistant.type !== CHAT_ASSISTANT_TYPE.SECURE) {
    return { kind: 'naw' };
  }

  const endpoint =
    assistant.endpoints.find((item) => item.type === 'LOCAL_SERVER') ?? assistant.endpoints[0];

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
    apiKey: endpoint.apiKey,
  };
}
