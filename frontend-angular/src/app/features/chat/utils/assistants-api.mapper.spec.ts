import { describe, expect, it } from 'vitest';
import { MOCK_ASSISTANTS } from '@app/core/constants/mock-data/assistants.mock';
import { mapAssistantListItem, parseAssistantsListResponse } from './assistants-api.mapper';

const liveApiSample = [
  {
    id: '7c414448e39d4746a560899130f48320',
    name: 'AzureOpenAI',
    description: '',
    category: null,
    categories: [],
    endpoints: [
      {
        id: 'test-openai-chat',
        model: 'gpt-4.1-mini-2025-04-14',
        type: 'AZURE_OPENAI_CHAT',
      },
    ],
  },
  {
    id: '0a9c21cc2c834e88b636f0a33c824da2',
    name: '経理情報アシスタント',
    description: '',
    category: null,
    categories: [],
    endpoints: [
      {
        id: 'test-openai-chat',
        model: 'gpt-4.1-mini-2025-04-14',
        type: 'AZURE_OPENAI_CHAT',
      },
    ],
  },
] as const;

describe('parseAssistantsListResponse', () => {
  it('maps a raw array response from the live API', () => {
    const result = parseAssistantsListResponse(liveApiSample);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '7c414448e39d4746a560899130f48320',
      name: 'AzureOpenAI',
      description: '',
      category: '',
      model: 'gpt-4.1-mini-2025-04-14',
    });
    expect(result[1].name).toBe('経理情報アシスタント');
  });

  it('maps mock `{ data, total }` responses', () => {
    const result = parseAssistantsListResponse({
      data: MOCK_ASSISTANTS,
      total: MOCK_ASSISTANTS.length,
    });
    expect(result).toHaveLength(MOCK_ASSISTANTS.length);
    expect(result[0]?.id).toBe(MOCK_ASSISTANTS[0].id);
    expect(result[0]?.name).toBe(MOCK_ASSISTANTS[0].name);
  });

  it('returns an empty array for unknown shapes', () => {
    expect(parseAssistantsListResponse(null)).toEqual([]);
    expect(parseAssistantsListResponse({ items: [] })).toEqual([]);
  });
});

describe('mapAssistantListItem', () => {
  it('prefers CHAT endpoint model and category name object', () => {
    const result = mapAssistantListItem({
      id: 'a1',
      name: 'Test',
      category: { name: '社内' },
      endpoints: [
        { model: 'embed', type: 'AZURE_OPENAI_EMBEDDING' },
        { model: 'gpt-4', type: 'AZURE_OPENAI_CHAT' },
      ],
    });
    expect(result.category).toBe('社内');
    expect(result.model).toBe('gpt-4');
  });
});
