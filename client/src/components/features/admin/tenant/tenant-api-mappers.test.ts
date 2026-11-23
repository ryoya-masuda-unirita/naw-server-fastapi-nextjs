import { describe, expect, test } from 'vitest';
import {
  buildTokenUsageListParams,
  mapEndpoint,
  mapEndpointList,
  mapTokenUsageList,
  unwrapApiData,
} from './tenant-api-mappers';
import { buildUserDisplayNameMap, userDisplayName } from './user-display-name';
import { formatNumber, formatUsageDateTime } from './tenant-format';
import type { UserApiItem } from '@/types/admin/user.types';

const BASE_PARAMS = {
  from: '2025-05-01T00:00:00Z',
  to: '2025-05-28T10:00:00Z',
  userId: '',
  page: 1,
  size: 5,
  sortField: null,
  sortOrder: null,
};

const FIXTURE_ENDPOINT = {
  id: '1',
  tenantId: 't1',
  endpointName: 'Chat',
  type: 'LOCAL_SERVER',
  endpoint: 'https://example.com',
  apiKey: 'key',
};

function buildUser(overrides: Partial<UserApiItem>): UserApiItem {
  return {
    id: '1',
    userId: 'u1',
    displayName: '',
    role: 'user',
    usedTokens: null,
    accountType: 'none',
    email: '',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('buildTokenUsageListParams', () => {
  test('1 始まりのページを 0 始まりにし、既定は作成日時の降順にすること', () => {
    const params = buildTokenUsageListParams({ ...BASE_PARAMS, page: 2 });

    expect(params['page']).toBe(1);
    expect(params['size']).toBe(5);
    expect(params['orderBy']).toBe('createdAt');
    expect(params['reverse']).toBe(true);
    expect(params['userId']).toBeUndefined();
  });

  test('画面の並べ替え項目を API の orderBy に直し、昇順なら reverse を false にすること', () => {
    const params = buildTokenUsageListParams({
      ...BASE_PARAMS,
      userId: 'user-1',
      sortField: 'amount',
      sortOrder: 'asc',
    });

    expect(params['orderBy']).toBe('totalTokens');
    expect(params['reverse']).toBe(false);
    expect(params['userId']).toBe('user-1');
  });
});

describe('mapTokenUsageList', () => {
  test('snake_case の user_id を userId として読むこと', () => {
    const result = mapTokenUsageList({
      contents: [{ id: 'usage-1', user_id: 'user-uuid', totalCredits: 100, createdAt: '2026-05-20T12:00:00Z' }],
      totalCount: 1,
      hasNext: false,
    });

    expect(result.contents[0].userId).toBe('user-uuid');
  });

  test('contents が配列でなければエラーにすること', () => {
    expect(() => mapTokenUsageList({ contents: 'x' })).toThrow('Invalid token usage list response');
  });
});

describe('mapEndpointList', () => {
  test('contents の応答を配列にすること', () => {
    expect(mapEndpointList({ contents: [FIXTURE_ENDPOINT], totalCount: 1, hasNext: false })).toHaveLength(1);
  });

  test('配列の応答をそのまま返すこと', () => {
    expect(mapEndpointList([FIXTURE_ENDPOINT])).toHaveLength(1);
  });

  test('どの形でもなければエラーにすること', () => {
    expect(() => mapEndpointList({ other: [] })).toThrow('Invalid endpoint list response');
  });
});

describe('mapEndpoint・unwrapApiData', () => {
  test('data に包まれたエンドポイントを取り出すこと', () => {
    expect(mapEndpoint({ message: 'ok', data: FIXTURE_ENDPOINT }).id).toBe('1');
  });

  test('包まれていないエンドポイントをそのまま返すこと', () => {
    expect(mapEndpoint(FIXTURE_ENDPOINT).id).toBe('1');
  });

  test('success が false の応答は error をメッセージにして投げること', () => {
    expect(() => unwrapApiData({ success: false, error: 'bad' })).toThrow('bad');
  });
});

describe('userDisplayName・buildUserDisplayNameMap', () => {
  test('displayName、name、email、id の順に使うこと', () => {
    expect(userDisplayName(buildUser({ displayName: '表示名', name: '名前' }))).toBe('表示名');
    expect(userDisplayName(buildUser({ name: '山田 太郎' }))).toBe('山田 太郎');
    expect(userDisplayName(buildUser({ email: 'a@b.com' }))).toBe('a@b.com');
    expect(userDisplayName(buildUser({}))).toBe('1');
  });

  test('id と userId の両方で引ける対応表を作ること', () => {
    const map = buildUserDisplayNameMap([buildUser({ id: 'uuid-1', userId: 'legacy-1', displayName: '表示名' })]);

    expect(map.get('uuid-1')).toBe('表示名');
    expect(map.get('legacy-1')).toBe('表示名');
  });
});

describe('表示用の整形', () => {
  test('日時を yyyy/MM/dd HH:mm にし、読めない値は空にすること', () => {
    expect(formatUsageDateTime(new Date(2026, 10, 5, 9, 7).toISOString())).toBe('2026/11/05 09:07');
    expect(formatUsageDateTime('')).toBe('');
  });

  test('数値を 3 桁区切りにすること', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
