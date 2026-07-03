import { describe, expect, it } from 'vitest';
import { CHAT_ASSISTANT_TYPE } from '@features/chat/constants/assistant-type.constants';
import type { MessageListAssistant } from '@app-types/chat/message-api.type';
import {
  buildLocalMessageContentsUrl,
  resolveAssistantEndpoint,
} from '@features/chat/utils/message-content-endpoint.resolver';

describe('message-content-endpoint.resolver', () => {
  const secureAssistant: MessageListAssistant = {
    id: 'asst-secure',
    type: CHAT_ASSISTANT_TYPE.SECURE,
    endpoints: [
      {
        type: 'LOCAL_SERVER',
        destination: 'https://local.example.com',
        apiKey: 'secret-key',
      },
    ],
  };

  it('SAAS_CHAT アシスタントは NAW 向けと判定すること', () => {
    const assistant: MessageListAssistant = {
      id: 'asst-saas',
      type: CHAT_ASSISTANT_TYPE.SAAS_CHAT,
      endpoints: [
        {
          type: 'AZURE_OPENAI_CHAT',
          destination: 'https://azure.example.com/',
          apiKey: '',
        },
      ],
    };

    expect(resolveAssistantEndpoint(assistant)).toEqual({ kind: 'naw' });
  });

  it('SECURE アシスタントは LOCAL 向け URL と apiKey を返すこと', () => {
    expect(resolveAssistantEndpoint(secureAssistant)).toEqual({
      kind: 'local',
      contentsUrl: 'https://local.example.com/api/messages/contents',
      apiKey: 'secret-key',
    });
  });

  it('destination 末尾スラッシュの有無で同一 URL になること', () => {
    const withSlash = buildLocalMessageContentsUrl('https://local.example.com/');
    const withoutSlash = buildLocalMessageContentsUrl('https://local.example.com');

    expect(withSlash).toBe('https://local.example.com/api/messages/contents');
    expect(withoutSlash).toBe(withSlash);
  });

  it('apiKey が空の SECURE アシスタントは invalid と判定すること', () => {
    const assistant: MessageListAssistant = {
      ...secureAssistant,
      endpoints: [{ type: 'LOCAL_SERVER', destination: 'https://local.example.com/', apiKey: '' }],
    };

    expect(resolveAssistantEndpoint(assistant)).toEqual({
      kind: 'invalid',
      reason: 'missing_api_key',
    });
  });

  it('endpoints が空の SECURE アシスタントは invalid と判定すること', () => {
    expect(
      resolveAssistantEndpoint({
        ...secureAssistant,
        endpoints: [],
      }),
    ).toEqual({ kind: 'invalid', reason: 'no_endpoint' });
  });
});
