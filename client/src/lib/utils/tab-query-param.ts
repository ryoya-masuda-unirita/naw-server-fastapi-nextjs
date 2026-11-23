// 移植元 core/utils/tab-query-param.util.ts の判定部分（Router に依存する部分は hooks/use-tab-query-param.ts）

/** クエリの tab 値を検証し、有効なタブ ID を返す */
export function resolveTabQueryParam<T extends string>(
  tab: unknown,
  validTabs: readonly T[],
  defaultTab: T
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
