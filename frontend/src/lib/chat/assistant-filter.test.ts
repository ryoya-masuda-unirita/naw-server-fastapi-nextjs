import { describe, expect, test } from 'vitest';
import type { Assistant } from '@/types/chat/assistant.type';
import { filterAssistants, parseLeadingMention } from './assistant-filter';
import { parsePromptTemplatesListResponse } from './prompt-templates-api-mapper';

function buildAssistant(id: string, name: string, category = ''): Assistant {
  return { id, name, description: '', category, model: '' };
}

const FIXTURE_ASSISTANTS = [
  buildAssistant('a1', 'Alpha', '営業'),
  buildAssistant('a2', 'Beta', '開発'),
];

describe('filterAssistants', () => {
  test('検索語が空なら全件を返すこと', () => {
    expect(filterAssistants('  ', FIXTURE_ASSISTANTS)).toHaveLength(2);
  });

  test('名前を大文字小文字を区別せずに絞り込めること', () => {
    expect(filterAssistants('ALP', FIXTURE_ASSISTANTS).map((a) => a.id)).toEqual(['a1']);
  });

  test('カテゴリでも絞り込めること', () => {
    expect(filterAssistants('開発', FIXTURE_ASSISTANTS).map((a) => a.id)).toEqual(['a2']);
  });
});

describe('parseLeadingMention', () => {
  test('先頭が「@」でなければメンションではないこと', () => {
    expect(parseLeadingMention('abc @x')).toEqual({ isActive: false, query: '', rest: 'abc @x' });
  });

  test('スペースがなければ全体を検索語にすること', () => {
    expect(parseLeadingMention('@alp')).toEqual({ isActive: true, query: 'alp', rest: '' });
  });

  test('最初のスペースまでを検索語、残りを本文にすること', () => {
    expect(parseLeadingMention('@alp   こんにちは')).toEqual({
      isActive: true,
      query: 'alp',
      rest: 'こんにちは',
    });
  });
});

describe('parsePromptTemplatesListResponse', () => {
  test('ページ形式の一覧を入力欄用のテンプレートにすること', () => {
    const result = parsePromptTemplatesListResponse({
      content: [
        { id: 't1', name: '要約', description: '要約します', systemPrompt: 'summarize' },
        { id: 't2', name: '翻訳', description: null, systemPrompt: null },
      ],
    });

    expect(result).toEqual([
      { value: 't1', label: '要約', desc: '要約します', systemPrompt: 'summarize' },
      { value: 't2', label: '翻訳', desc: '' },
    ]);
  });

  test('配列そのものでも、想定外の形でも落ちないこと', () => {
    expect(parsePromptTemplatesListResponse([{ id: 't1', name: 'x' }])).toHaveLength(1);
    expect(parsePromptTemplatesListResponse(null)).toEqual([]);
  });
});
