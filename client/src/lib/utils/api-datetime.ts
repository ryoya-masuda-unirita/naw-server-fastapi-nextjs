/** Formats a Date as `YYYY-MM-DDTHH:mm:ssZ` (UTC, no fractional seconds). */
export function formatApiDateTimeUtc(date: Date): string {
  return date.toISOString().slice(0, 19) + 'Z';
}

export function startOfUtcDay(date: Date): string {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0),
  );
  return formatApiDateTimeUtc(start);
}

/** Formats an ISO datetime as `YYYY/MM/DD` in UTC (for billing period display). */
export function formatUtcDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

export type TokenUsagePeriodType = 'today' | 'month';

/** Builds `from` / `to` query values for token-usage summary APIs. */
export function buildTokenUsageDateRange(
  period: TokenUsagePeriodType,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = formatApiDateTimeUtc(now);

  if (period === 'today') {
    return { from: startOfUtcDay(now), to };
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { from: formatApiDateTimeUtc(monthStart), to };
}
