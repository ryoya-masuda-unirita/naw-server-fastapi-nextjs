import { useEffect, useState } from 'react';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * 値が `delayMs` ミリ秒変わらなかったときだけ更新される値を返す（移植元 shared/utils/debounce-signal.ts）。
 * 検索欄の入力ごとに API を呼ばないために使う。
 */
export function useDebouncedValue<T>(value: T, delayMs = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
