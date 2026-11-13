import { describe, expect, test } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { useCreditUsage } from './use-credit-usage';
import { useTokenUsage } from './use-token-usage';

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const FIXTURE_ME = { totalCredits: 10, periodFrom: '2026-11-01T00:00:00Z' };
const FIXTURE_WORKSPACE = { totalCredits: 100, creditLimit: 1000 };
const FIXTURE_SUMMARY = {
  inputTokens: 1,
  outputTokens: 2,
  totalTokens: 3,
  inputCredits: 4,
  outputCredits: 5,
  totalCredits: 9,
};
const API_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('useCreditUsage', () => {
  test('fetchUsage を呼ぶまでは取得せず、呼ぶと自分とワークスペースの利用量を取得すること', async () => {
    let requestCount = 0;
    server.use(
      http.get('*/api/credit-usage/me', () => {
        requestCount += 1;
        return HttpResponse.json(FIXTURE_ME);
      }),
      http.get('*/api/credit-usage/workspace', () => {
        requestCount += 1;
        return HttpResponse.json(FIXTURE_WORKSPACE);
      })
    );
    const { result } = renderHook(() => useCreditUsage(), { wrapper: createWrapper() });

    expect(result.current.meQuery.fetchStatus).toBe('idle');
    expect(requestCount).toBe(0);

    act(() => result.current.fetchUsage());

    await waitFor(() => {
      expect(result.current.meQuery.data).toEqual(FIXTURE_ME);
      expect(result.current.workspaceQuery.data).toEqual(FIXTURE_WORKSPACE);
    });
    expect(requestCount).toBe(2);
  });
});

describe('useTokenUsage', () => {
  test('本日分と今月分を UTC の from・to 付きで取得すること', async () => {
    const requested: URL[] = [];
    server.use(
      http.get('*/api/token-usages', ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json(FIXTURE_SUMMARY);
      })
    );
    const { result } = renderHook(() => useTokenUsage(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.tokenUsagesTodayQuery.data).toEqual(FIXTURE_SUMMARY);
      expect(result.current.tokenUsagesMonthQuery.data).toEqual(FIXTURE_SUMMARY);
    });
    expect(requested).toHaveLength(2);
    requested.forEach((url) => {
      expect(url.searchParams.get('from')).toMatch(API_DATETIME_PATTERN);
      expect(url.searchParams.get('to')).toMatch(API_DATETIME_PATTERN);
    });
  });

  test('再描画しても取り直さないこと', async () => {
    let requestCount = 0;
    server.use(
      http.get('*/api/token-usages', () => {
        requestCount += 1;
        return HttpResponse.json(FIXTURE_SUMMARY);
      })
    );
    const { result, rerender } = renderHook(() => useTokenUsage(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.tokenUsagesMonthQuery.isSuccess).toBe(true));

    rerender();
    rerender();

    expect(requestCount).toBe(2);
  });
});
