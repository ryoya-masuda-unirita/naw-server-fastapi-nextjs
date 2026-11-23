import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDebouncedValue } from './use-debounced-value';
import { useTabQueryParam } from './use-tab-query-param';

const TABS = ['terms', 'tags'] as const;

function renderTabHook(initialEntry: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({
      tab: useTabQueryParam({ validTabs: TABS, defaultTab: 'terms' }),
      location: useLocation(),
    }),
    { wrapper }
  );
}

describe('useTabQueryParam', () => {
  test('?tab= が有効ならそのタブを選ぶこと', () => {
    const { result } = renderTabHook('/glossary?tab=tags');

    expect(result.current.tab.activeTabId).toBe('tags');
  });

  test('?tab= が無い・不正なら既定のタブにして URL も直すこと', () => {
    const { result } = renderTabHook('/glossary?tab=invalid&page=2');

    expect(result.current.tab.activeTabId).toBe('terms');
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('tab')).toBe('terms');
    expect(params.get('page')).toBe('2');
  });

  test('タブを切り替えると page・pageSize を消すこと', () => {
    const { result } = renderTabHook('/glossary?tab=terms&page=3&pageSize=50&q=x');

    act(() => result.current.tab.onTabChange({ id: 'tags' }));

    const params = new URLSearchParams(result.current.location.search);
    expect(result.current.tab.activeTabId).toBe('tags');
    expect(params.has('page')).toBe(false);
    expect(params.has('pageSize')).toBe(false);
    expect(params.get('q')).toBe('x');
  });
});

describe('useDebouncedValue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('値が指定時間変わらなかったときだけ更新されること', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
