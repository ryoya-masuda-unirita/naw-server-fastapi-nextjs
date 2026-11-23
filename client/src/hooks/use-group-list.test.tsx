import { describe, expect, test } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import type { GroupApiItem } from '@/types/admin/group-management.types';
import {
  EMPTY_LOOKUP,
  needsNameLookup,
  toViewModel,
  useNameLookup,
  type NameLookup,
} from './use-group-list';

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const base: GroupApiItem = { id: 'g', name: 'チーム' };

describe('needsNameLookup', () => {
  test('名前が揃っているグループは、対応表を要らないこと', () => {
    const item: GroupApiItem = {
      ...base,
      users: ['u1'],
      adminUserIds: ['u1'],
      adminUserNames: ['山田'],
      userNames: ['山田'],
      assistants: ['営業'],
      assistantIds: ['a1'],
      promptTemplates: ['議事録'],
      promptTemplateIds: ['t1'],
    };

    expect(needsNameLookup(item)).toBe(false);
  });

  test('ID も名前もないグループは、対応表を要らないこと', () => {
    expect(needsNameLookup(base)).toBe(false);
    expect(
      needsNameLookup({
        ...base,
        users: [],
        adminUserIds: [],
        assistantIds: [],
        promptTemplateIds: [],
      }),
    ).toBe(false);
  });

  test.each([
    ['管理者', { adminUserIds: ['u1'], adminUserNames: [] }],
    ['ユーザー', { users: ['u1'], userNames: [] }],
    ['アシスタント', { assistantIds: ['a1'], assistants: [] }],
    ['テンプレート', { promptTemplateIds: ['t1'], promptTemplates: [] }],
  ])('%s の名前がなく ID だけのとき、対応表を要ること', (_label, fields) => {
    expect(needsNameLookup({ ...base, ...fields })).toBe(true);
  });

  test('名前の件数が ID の件数と合わないアシスタントは、対応表を要ること', () => {
    // 名前の並びを ID の並びと対応させられない（一部しか名前がない）
    expect(needsNameLookup({ ...base, assistantIds: ['a1', 'a2'], assistants: ['営業'] })).toBe(
      true,
    );
  });
});

describe('needsNameLookup と toViewModel の整合', () => {
  /**
   * 対応表の名前は、一覧が返す名前と同じ（実際の backend は、同じデータから両方を作る）。
   * 対応表を要らないと判定した項目は、この対応表を使っても、使わなくても、同じ表示になる
   */
  const richLookup: NameLookup = {
    users: new Map([
      ['u1', '山田'],
      ['u2', '鈴木'],
    ]),
    assistants: new Map([
      ['a1', '営業'],
      ['a2', '開発'],
    ]),
    templates: new Map([
      ['t1', '議事録'],
      ['t2', '報告書'],
    ]),
  };
  const items: Record<string, GroupApiItem> = {
    名前が揃っている: {
      ...base,
      users: ['u1'],
      adminUserIds: ['u1'],
      adminUserNames: ['山田'],
      userNames: ['山田'],
      assistants: ['営業'],
      assistantIds: ['a1'],
      promptTemplates: ['議事録'],
      promptTemplateIds: ['t1'],
    },
    'ID も名前もない': base,
    '管理者の名前が ID の件数より少ない': {
      ...base,
      adminUserIds: ['u1', 'u2'],
      adminUserNames: ['山田'],
    },
    'アシスタントの名前だけで ID がない': { ...base, assistants: ['営業', '開発'] },
    'アシスタントの ID だけ': { ...base, assistantIds: ['a1', 'a2'] },
    テンプレートの名前の件数が合わない: {
      ...base,
      promptTemplateIds: ['t1', 't2'],
      promptTemplates: ['議事録'],
    },
    'ユーザーの ID だけ': { ...base, users: ['u1', 'u2'] },
  };

  test.each(Object.entries(items))(
    '%s: 対応表を要らないと判定した項目は、対応表の有無で表示が変わらないこと',
    (_label, item) => {
      // 判定と toViewModel の取捨選択がずれて、対応表を取らないのに ID のまま表示される、を防ぐ
      if (!needsNameLookup(item)) {
        expect(toViewModel(item, EMPTY_LOOKUP)).toEqual(toViewModel(item, richLookup));
      }
    },
  );

  test('対応表を要ると判定した項目は、対応表があると表示が変わること', () => {
    const item = items['ユーザーの ID だけ'];

    expect(needsNameLookup(item)).toBe(true);
    expect(toViewModel(item, EMPTY_LOOKUP)).not.toEqual(toViewModel(item, richLookup));
  });
});

describe('useNameLookup', () => {
  test('無効のあいだは取得しないこと', async () => {
    let calls = 0;
    server.use(
      http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () => {
        calls += 1;
        return HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 1000 });
      }),
    );

    const { result } = renderHook(() => useNameLookup(false), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(calls).toBe(0);
  });

  test('ユーザー・アシスタント・テンプレートを、1,000 件を超えても全ページ取ること', async () => {
    const total = 2500;
    const requestedPages: Record<string, number[]> = { users: [], assistants: [], templates: [] };
    const serve = (path: string, key: string, prefix: string) =>
      http.get(mockPath(path), ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = Number(params.get('page'));
        const size = Number(params.get('size'));
        requestedPages[key].push(page);
        const start = page * size;
        const content = Array.from(
          { length: Math.max(0, Math.min(size, total - start)) },
          (_, i) => ({
            id: `${prefix}${start + i}`,
            name: `${key}${start + i}`,
            loginId: `login${start + i}`,
            role: 'USER',
          }),
        );
        return HttpResponse.json({ content, totalElements: total, number: page, size });
      });
    server.use(
      serve(API_PATHS.ADMIN.USERS.LIST, 'users', 'u'),
      serve(API_PATHS.ADMIN.ASSISTANTS.LIST, 'assistants', 'a'),
      serve(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, 'templates', 't'),
    );

    const { result } = renderHook(() => useNameLookup(true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data?.users.size).toBe(total));
    expect(result.current.data?.assistants.get('a2499')).toBe('assistants2499');
    expect(result.current.data?.templates.get('t2499')).toBe('templates2499');
    expect(requestedPages.users).toEqual([0, 1, 2]);
  });
});
