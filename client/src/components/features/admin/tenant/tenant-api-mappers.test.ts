import { describe, expect, test } from 'vitest';
import {
  buildTokenUsageListParams,
  mapEndpoint,
  mapEndpointList,
  mapTokenUsageList,
  unwrapApiData,
} from './tenant-api-mappers';
import { userDisplayName } from './user-display-name';
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

const USAGE_ITEM = {
  id: 'usage-1',
  userId: 'user-uuid',
  userName: '山田太郎',
  userType: 'ACTIVE',
  totalCredits: 100,
  createdAt: '2026-05-20T12:00:00Z',
};

function usageList(item: Record<string, unknown>) {
  return { contents: [item], totalCount: 1, hasNext: false };
}

describe('mapTokenUsageList', () => {
  test('snake_case の user_id を userId として読むこと', () => {
    const result = mapTokenUsageList(usageList({ ...USAGE_ITEM, userId: undefined, user_id: 'user-uuid' }));

    expect(result.contents[0].userId).toBe('user-uuid');
  });

  test('reads the user name and the user type', () => {
    /** 利用者名の出し分けに使う `userName`・`userType` を読む */
    const [row] = mapTokenUsageList(usageList(USAGE_ITEM)).contents;

    expect(row.userName).toBe('山田太郎');
    expect(row.userType).toBe('ACTIVE');
  });

  test('keeps a deleted user without a name', () => {
    /** 削除されたユーザー（利用者の ID も無い行）は、名前が無くてもエラーにしない */
    const [row] = mapTokenUsageList(
      usageList({ ...USAGE_ITEM, userId: null, userName: null, userType: 'DELETED' }),
    ).contents;

    expect(row.userType).toBe('DELETED');
    expect(row.userName).toBeNull();
  });

  test.each([
    ['is missing', { userType: undefined }, 'Missing token usage userType: usage-1'],
    ['is null', { userType: null }, 'Missing token usage userType: usage-1'],
    ['is unknown', { userType: 'ADMIN' }, 'Invalid token usage userType: ADMIN'],
  ])('fails when the user type %s', (_name, override, message) => {
    /** 種類が分からないまま ID や `-` を出さず、失敗にする（移植元と同じ） */
    expect(() => mapTokenUsageList(usageList({ ...USAGE_ITEM, ...override }))).toThrow(message);
  });

  test('fails when an active user has no name', () => {
    /** 通常のユーザーで名前が無い応答は、ID を出さず失敗にする */
    expect(() => mapTokenUsageList(usageList({ ...USAGE_ITEM, userName: '' }))).toThrow(
      'Missing token usage userName: usage-1',
    );
    expect(() => mapTokenUsageList(usageList({ ...USAGE_ITEM, userName: null }))).toThrow(
      'Missing token usage userName: usage-1',
    );
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

describe('userDisplayName', () => {
  test('displayName、name、email、id の順に使うこと', () => {
    expect(userDisplayName(buildUser({ displayName: '表示名', name: '名前' }))).toBe('表示名');
    expect(userDisplayName(buildUser({ name: '山田 太郎' }))).toBe('山田 太郎');
    expect(userDisplayName(buildUser({ email: 'a@b.com' }))).toBe('a@b.com');
    expect(userDisplayName(buildUser({}))).toBe('1');
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
