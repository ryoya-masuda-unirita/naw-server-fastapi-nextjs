import { Assistant } from '@app-types/chat/assistant.type';
import { resolveInitialAssistant } from './resolve-initial-assistant.helpers';

const assistants: Assistant[] = [
  {
    id: 'asst-001',
    name: 'デフォルトアシスタント',
    description: 'desc',
    category: '一般',
    model: 'gpt-4o',
    isDefault: true,
  },
  {
    id: 'asst-002',
    name: 'ルーム専用アシスタント',
    description: 'desc',
    category: '営業',
    model: 'gpt-4o',
  },
];

describe('resolveInitialAssistant', () => {
  test('defaultAssistantId が一致するアシスタントを返すこと', () => {
    expect(resolveInitialAssistant(assistants, 'asst-002')).toEqual(assistants[1]);
  });

  test('defaultAssistantId が null の場合、isDefault を返すこと', () => {
    expect(resolveInitialAssistant(assistants, null)).toEqual(assistants[0]);
  });

  test('defaultAssistantId が一覧にない場合、isDefault にフォールバックすること', () => {
    expect(resolveInitialAssistant(assistants, 'missing-id')).toEqual(assistants[0]);
  });

  test('assistants が空の場合 null を返すこと', () => {
    expect(resolveInitialAssistant([], 'asst-002')).toBeNull();
  });
});
