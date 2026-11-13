import { describe, expect, test } from 'vitest';
import {
  mapGroupAssistantItem,
  mapGroupDetail,
  mapGroupMemberUser,
  mapGroupTemplateItem,
  parseSpringPage,
} from './group-api-mappers';

describe('parseSpringPage', () => {
  test('ページの形の応答を中身ごと変換すること', () => {
    const page = parseSpringPage(
      { content: [1, 2], totalElements: 2, number: 1, size: 25 },
      (item) => Number(item) * 10,
    );

    expect(page).toEqual({ content: [10, 20], totalElements: 2, number: 1, size: 25 });
  });

  test('ページの形でない応答は 0 件として扱うこと', () => {
    expect(parseSpringPage({ data: [] }, String)).toEqual({
      content: [],
      totalElements: 0,
      number: 0,
      size: 0,
    });
    expect(parseSpringPage(null, String).content).toEqual([]);
  });
});

describe('mapGroupMemberUser', () => {
  test('表示名が無ければ名前、それも無ければユーザー ID を使うこと', () => {
    const named = mapGroupMemberUser({ userId: 'u1', name: 'yamada', displayName: null });
    const bare = mapGroupMemberUser({ userId: 'u2' });

    expect(named.displayName).toBe('yamada');
    expect(bare.displayName).toBe('u2');
  });

  test('権限は大文字小文字を問わず画面用に直し、不明な値は一般にすること', () => {
    expect(mapGroupMemberUser({ userId: 'a', role: 'ADMIN' }).role).toBe('admin');
    expect(mapGroupMemberUser({ userId: 'b', role: 'system' }).role).toBe('system');
    expect(mapGroupMemberUser({ userId: 'c', role: 'other' }).role).toBe('user');
  });

  test('クレジットが無ければ項目ごと持たないこと', () => {
    expect('totalCredits' in mapGroupMemberUser({ userId: 'a' })).toBe(false);
    expect(mapGroupMemberUser({ userId: 'a', totalCredits: 5 }).totalCredits).toBe(5);
  });
});

describe('mapGroupDetail', () => {
  test('応答が空でも空文字の ID と名前を返すこと', () => {
    expect(mapGroupDetail(null)).toEqual({
      id: '',
      name: '',
      tenantId: undefined,
      updatedAt: undefined,
    });
  });
});

describe('mapGroupAssistantItem', () => {
  test('category が無ければ categories の先頭を使うこと', () => {
    const item = mapGroupAssistantItem({
      id: 'a1',
      name: 'A',
      categories: [{ id: 'c1', name: '営業' }],
    });

    expect(item.category).toEqual({ id: 'c1', name: '営業' });
  });

  test('エンドポイントの表示名が無ければモデル名を使うこと', () => {
    const item = mapGroupAssistantItem({
      id: 'a1',
      name: 'A',
      endpoints: [{ id: 'e1', model: 'gpt-4' }],
    });

    expect(item.endpoints[0].label).toBe('gpt-4');
  });

  test('種別は assistantType を優先し、無ければ type を使うこと', () => {
    expect(mapGroupAssistantItem({ assistantType: 'SECURE', type: 'SAAS_CHAT' }).type).toBe(
      'SECURE',
    );
    expect(mapGroupAssistantItem({ type: 'SAAS_CHAT' }).type).toBe('SAAS_CHAT');
  });
});

describe('mapGroupTemplateItem', () => {
  test('Set で来た groups も文字列の配列にすること', () => {
    const item = mapGroupTemplateItem({ id: 't1', name: 'T', groups: new Set(['g1', 'g2']) });

    expect(item.groups).toEqual(['g1', 'g2']);
  });
});
