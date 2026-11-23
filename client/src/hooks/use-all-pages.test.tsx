import { describe, expect, test } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { fetchAddAssistantOptions } from './use-group-assistants';
import { fetchAddTemplateOptions } from './use-group-templates';
import { fetchAddUserOptions } from './use-group-users';
import { useChatHistoryUserOptions } from './use-chat-history';
import { useFeedbackAssistants, useLearningFolders } from './use-feedback';
import { fetchGroupOptions } from './use-assistant-list';
import { usePromptTemplates } from './use-prompt-templates';

/** 20 件を超える（既定のページ・50 件・1 ページ分を超える）件数 */
const MANY = 2500;

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

interface Served {
  /** 受けたリクエストの page・size（size を送らなければ undefined） */
  requests: { page: number; size: number | undefined }[];
}

/**
 * Spring のページ形式で、`total` 件の連番を返す。`maxSize` を超える size は、server と同じく 400 にする。
 * size を送らないと、server の既定（20 件）で返す。size が 0 のときも 20 件に戻す（`/prompt-templates` の仕様）
 */
function servePaged(
  path: string,
  total: number,
  makeItem: (index: number) => Record<string, unknown>,
  maxSize = 1000,
): Served {
  const served: Served = { requests: [] };
  server.use(
    http.get(mockPath(path), ({ request }) => {
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 0);
      const rawSize = params.get('size');
      served.requests.push({ page, size: rawSize === null ? undefined : Number(rawSize) });
      const size = !rawSize || Number(rawSize) === 0 ? 20 : Number(rawSize);
      if (size > maxSize) return HttpResponse.json({ message: 'size too large' }, { status: 400 });
      const start = page * size;
      const content = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) =>
        makeItem(start + i),
      );
      return HttpResponse.json({ content, totalElements: total, number: page, size });
    }),
  );
  return served;
}

const user = (i: number) => ({ id: `u${i}`, loginId: `login${i}`, name: `user${i}`, role: 'USER' });
const assistant = (i: number) => ({
  id: `a${i}`,
  name: `assistant${i}`,
  description: 'd',
  type: 'SAAS_CHAT',
});
const template = (i: number) => ({
  id: `t${i}`,
  name: `template${i}`,
  description: 'd',
  content: 'c',
});
const folder = (i: number) => ({ id: `f${i}`, name: `folder${i}`, type: 'SAAS_GLOBAL' });

describe('候補・選択肢の取得は、全ページを取ること', () => {
  test('テンプレートメニューは、21 件目以降も出て、size: 0 を送らないこと', async () => {
    const served = servePaged(API_PATHS.PROMPT_TEMPLATES.LIST, MANY, template);

    const { result } = renderHook(() => usePromptTemplates(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(MANY));
    expect(served.requests.every((r) => r.size !== 0 && r.size !== undefined)).toBe(true);
    expect(served.requests.map((r) => r.page)).toEqual([0, 1, 2]);
  });

  test('フィードバックのアシスタント候補は、21 件目以降も出ること', async () => {
    servePaged(API_PATHS.ADMIN.ASSISTANTS.LIST, MANY, assistant);

    const { result } = renderHook(() => useFeedbackAssistants(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(MANY));
  });

  test('フィードバックの学習先フォルダ候補は、21 件目以降も出ること', async () => {
    servePaged(API_PATHS.INDEXES.LIST, MANY, folder);

    const { result } = renderHook(() => useLearningFolders(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(MANY));
  });

  test('チーム詳細の追加候補（ユーザー）は、51 件目以降も出て、チームに入っていない条件を送ること', async () => {
    const requested: URLSearchParams[] = [];
    server.use(
      http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requested.push(params);
        const page = Number(params.get('page'));
        const size = Number(params.get('size'));
        const start = page * size;
        const content = Array.from({ length: Math.max(0, Math.min(size, MANY - start)) }, (_, i) =>
          user(start + i),
        );
        return HttpResponse.json({ content, totalElements: MANY, number: page, size });
      }),
    );

    const options = await fetchAddUserOptions('group-1');

    expect(options).toHaveLength(MANY);
    expect(requested.every((p) => p.get('excludeGroupId') === 'group-1')).toBe(true);
  });

  test('チーム詳細の追加候補（アシスタント）は、51 件目以降も出ること', async () => {
    servePaged(API_PATHS.ADMIN.ASSISTANTS.LIST, MANY, assistant);

    expect(await fetchAddAssistantOptions('group-1')).toHaveLength(MANY);
  });

  test('チーム詳細の追加候補（テンプレート）は、51 件目以降も出ること', async () => {
    servePaged(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, MANY, template);

    expect(await fetchAddTemplateOptions('group-1')).toHaveLength(MANY);
  });

  test('追加候補は、途中のページで失敗したら、一部だけを出さず、候補なしにすること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST), ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page === 1) return HttpResponse.json({ message: 'ng' }, { status: 500 });
        return HttpResponse.json({
          content: Array.from({ length: 1000 }, (_, i) => assistant(i)),
          totalElements: MANY,
          number: 0,
          size: 1000,
        });
      }),
    );

    expect(await fetchAddAssistantOptions('group-1')).toEqual([]);
  });

  test('アシスタント管理のチーム候補は、server の上限（100）ごとに全ページ取ること', async () => {
    const requested: number[] = [];
    server.use(
      http.get(mockPath(API_PATHS.ADMIN.ALL_GROUPS.LIST), ({ request }) => {
        const params = new URL(request.url).searchParams;
        const page = Number(params.get('page') ?? 0);
        const size = Number(params.get('size') ?? 20);
        requested.push(size);
        // /admin/all-groups は size が 100 を超えると 422 になる（移植元の 1000 は持ち込めない）
        if (size > 100) return HttpResponse.json({ message: 'size' }, { status: 422 });
        const total = 250;
        const start = page * size;
        const data = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({
          id: `g${start + i}`,
          name: `group${start + i}`,
        }));
        return HttpResponse.json({ data, total, page: page + 1, size });
      }),
    );

    const options = await fetchGroupOptions();

    expect(options).toHaveLength(250);
    expect(requested).toEqual([100, 100, 100]);
  });

  test('チャット履歴の利用者の絞り込みは、直近の履歴に出てこない利用者も選べること', async () => {
    const requested: URLSearchParams[] = [];
    server.use(
      http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), ({ request }) => {
        const params = new URL(request.url).searchParams;
        requested.push(params);
        const page = Number(params.get('page'));
        const size = Number(params.get('size'));
        const start = page * size;
        const content = Array.from({ length: Math.max(0, Math.min(size, MANY - start)) }, (_, i) =>
          user(start + i),
        );
        return HttpResponse.json({ content, totalElements: MANY, number: page, size });
      }),
    );

    const { result } = renderHook(() => useChatHistoryUserOptions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(MANY));
    // 利用量を集計しない（backend の既定は false なので、送らないか false）
    expect(requested.every((p) => (p.get('includeUsage') ?? 'false') === 'false')).toBe(true);
  });
});
