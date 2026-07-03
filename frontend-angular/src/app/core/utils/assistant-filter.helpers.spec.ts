import { Assistant } from '@app-types/chat/assistant.type';
import { filterAssistants, parseLeadingMention } from './assistant-filter.helpers';

const assistants: Assistant[] = [
  {
    id: '1',
    name: '社内情報アシスタント',
    description: 'desc',
    category: '社内知識',
    model: 'gpt-4o',
  },
  {
    id: '2',
    name: 'データ分析アシスタント',
    description: 'desc',
    category: 'データ分析',
    model: 'gpt-4o',
  },
];

describe('filterAssistants', () => {
  test('空クエリの場合、全件を返すこと', () => {
    expect(filterAssistants('', assistants)).toEqual(assistants);
  });

  test('名前で部分一致フィルタできること', () => {
    expect(filterAssistants('データ', assistants)).toEqual([assistants[1]]);
  });

  test('カテゴリで部分一致フィルタできること', () => {
    expect(filterAssistants('社内', assistants)).toEqual([assistants[0]]);
  });

  test('大文字小文字を区別しないこと', () => {
    expect(filterAssistants('GPT', assistants)).toEqual([]);
    expect(filterAssistants('データ', assistants)).toHaveLength(1);
  });
});

describe('parseLeadingMention', () => {
  test('@ で始まらない場合は非アクティブであること', () => {
    expect(parseLeadingMention('hello')).toEqual({
      isActive: false,
      query: '',
      rest: 'hello',
    });
  });

  test('@ のみの場合、query が空であること', () => {
    expect(parseLeadingMention('@')).toEqual({
      isActive: true,
      query: '',
      rest: '',
    });
  });

  test('@query の場合、query を抽出できること', () => {
    expect(parseLeadingMention('@営業')).toEqual({
      isActive: true,
      query: '営業',
      rest: '',
    });
  });

  test('@query 以降に本文がある場合、rest を抽出できること', () => {
    expect(parseLeadingMention('@営業 こんにちは')).toEqual({
      isActive: true,
      query: '営業',
      rest: 'こんにちは',
    });
  });
});
