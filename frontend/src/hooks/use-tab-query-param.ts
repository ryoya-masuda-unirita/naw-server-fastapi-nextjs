import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveTabQueryParam, shouldNormalizeTabQueryParam } from '@/lib/utils/tab-query-param';

export interface TabQueryParamConfig<T extends string> {
  validTabs: readonly T[];
  defaultTab: T;
}

export interface TabQueryParamState<T extends string> {
  activeTabId: T;
  /** タブ部品（#278）の TabItem をそのまま渡せるよう、id だけを見る */
  onTabChange: (tab: { id: string }) => void;
}

const TAB_QUERY = 'tab';
// タブを切り替えたら一覧のページ位置は引き継がない（移植元と同じ）
const PAGING_QUERIES = ['page', 'pageSize'] as const;

/**
 * `?tab=` クエリでタブ状態を保持する（移植元 core/utils/tab-query-param.util.ts の createTabQueryParam）。
 * - 未指定・不正値は defaultTab に置き換える（履歴は増やさない）
 * - タブ切替時に page / pageSize を消す
 */
export function useTabQueryParam<T extends string>(
  config: TabQueryParamConfig<T>
): TabQueryParamState<T> {
  const { validTabs, defaultTab } = config;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get(TAB_QUERY);
  const activeTabId = resolveTabQueryParam(rawTab, validTabs, defaultTab);

  useEffect(() => {
    if (!shouldNormalizeTabQueryParam(rawTab, activeTabId)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(TAB_QUERY, activeTabId);
        return next;
      },
      { replace: true }
    );
  }, [rawTab, activeTabId, setSearchParams]);

  const onTabChange = useCallback(
    (tab: { id: string }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(TAB_QUERY, tab.id);
        PAGING_QUERIES.forEach((key) => next.delete(key));
        return next;
      });
    },
    [setSearchParams]
  );

  return { activeTabId, onTabChange };
}
