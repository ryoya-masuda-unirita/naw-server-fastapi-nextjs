import { computed, effect, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import type { TabItem } from '@app-types/tab.type';

export interface TabQueryParamConfig<T extends string> {
  validTabs: readonly T[];
  defaultTab: T;
}

export interface TabQueryParamState<T extends string> {
  readonly activeTabId: Signal<T>;
  readonly onTabChange: (tab: TabItem) => void;
}

/** queryParams の tab 値を検証し、有効なタブ ID を返す */
export function resolveTabQueryParam<T extends string>(
  tab: unknown,
  validTabs: readonly T[],
  defaultTab: T,
): T {
  if (typeof tab === 'string' && (validTabs as readonly string[]).includes(tab)) {
    return tab as T;
  }
  return defaultTab;
}

/** URL の tab クエリを正規化すべきか判定する */
export function shouldNormalizeTabQueryParam(rawTab: unknown, resolvedTab: string): boolean {
  return rawTab !== resolvedTab;
}

/**
 * `?tab=` クエリパラメータでタブ状態を永続化する。
 * - 未指定・不正値は defaultTab に正規化（replaceUrl: true）
 * - タブ切替時に page / pageSize を除去
 */
export function createTabQueryParam<T extends string>(
  config: TabQueryParamConfig<T>,
): TabQueryParamState<T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);

  const queryParams = toSignal(route.queryParams, { initialValue: {} as Params });

  const activeTabId = computed(() =>
    resolveTabQueryParam(queryParams()['tab'], config.validTabs, config.defaultTab),
  );

  effect(() => {
    const rawTab = queryParams()['tab'];
    const resolved = activeTabId();
    if (!shouldNormalizeTabQueryParam(rawTab, resolved)) return;

    void router.navigate([], {
      relativeTo: route,
      queryParams: { tab: resolved },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  const onTabChange = (tab: TabItem): void => {
    void router.navigate([], {
      relativeTo: route,
      queryParams: { tab: tab.id, page: null, pageSize: null },
      queryParamsHandling: 'merge',
    });
  };

  return { activeTabId, onTabChange };
}
