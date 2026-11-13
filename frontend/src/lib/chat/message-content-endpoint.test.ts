import { describe, expect, it } from 'vitest';
import { CHAT_ASSISTANT_TYPE } from '@/lib/constants/assistant-type';
import type { MessageListAssistant } from '@/types/chat/message-api.type';
import {
  buildLocalMessageContentUrl,
  buildLocalMessageContentsUrl,
  resolveAssistantEndpoint,
  resolveAssistantModel,
} from './message-content-endpoint';

describe('message-content-endpoint.resolver', () => {

  const secureAssistant: MessageListAssistant = {
    id: 'asst-secure',
    type: CHAT_ASSISTANT_TYPE.SECURE,
    endpoints: [
      {
        type: 'LOCAL_SERVER',
        destination: 'https://local.example.com',
        apiKey: 'secret-key',
        model: 'local-llm-model',
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
      contentUrl: 'https://local.example.com/api/messages/content',
      apiKey: 'secret-key',
    });
  });

  it('SECURE アシスタントは endpoint の model を返すこと', () => {
    expect(resolveAssistantModel(secureAssistant)).toBe('local-llm-model');
  });

  it('model 未設定の SECURE アシスタントは undefined を返すこと', () => {
    expect(
      resolveAssistantModel({
        ...secureAssistant,
        endpoints: [
          { type: 'LOCAL_SERVER', destination: 'https://local.example.com', apiKey: 'k' },
        ],
      }),
    ).toBeUndefined();
  });

  it('assistant 直下の model を返すこと', () => {
    expect(
      resolveAssistantModel({
        ...secureAssistant,
        model: 'root-model',
        endpoints: [
          { type: 'LOCAL_SERVER', destination: 'https://local.example.com', apiKey: 'k' },
        ],
      }),
    ).toBe('root-model');
  });

  it('buildLocalMessageContentUrl は content SSE 向け URL を返すこと', () => {
    expect(buildLocalMessageContentUrl('https://local.example.com')).toBe(
      'https://local.example.com/api/messages/content',
    );
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

  it('endpoint の model が空白のときは assistant 直下の model にフォールバックすること', () => {
    expect(
      resolveAssistantModel({
        ...secureAssistant,
        model: 'root-model',
        endpoints: [{ ...secureAssistant.endpoints[0], model: '  ' }],
      }),
    ).toBe('root-model');
  });
});
