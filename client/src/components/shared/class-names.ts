type ClassValue = string | false | null | undefined;

/**
 * 移植元の `[class.xxx]` / `[ngClass]` の組み合わせを 1 本の className にまとめる。
 * 偽値は捨てる。
 */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
