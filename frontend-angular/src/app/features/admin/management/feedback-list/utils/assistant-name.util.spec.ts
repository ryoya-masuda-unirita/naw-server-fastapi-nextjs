import { describe, expect, test } from 'vitest';
import { resolveAssistantName } from './assistant-name.util';

describe('resolveAssistantName', () => {
  test('assistantNameがある場合はそのまま返すこと', () => {
    expect(resolveAssistantName('テストアシスタント', '不明なアシスタント')).toBe(
      'テストアシスタント',
    );
  });

  test('assistantNameがnullの場合は不明ラベルを返すこと', () => {
    expect(resolveAssistantName(null, '不明なアシスタント')).toBe('不明なアシスタント');
  });

  test('assistantNameがundefinedの場合は不明ラベルを返すこと', () => {
    expect(resolveAssistantName(undefined, '不明なアシスタント')).toBe('不明なアシスタント');
  });
});
