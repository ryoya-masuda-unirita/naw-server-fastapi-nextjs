import type { PeriodRange } from './period-filter.component';

/**
 * Map a period-filter selection (preset key + optional custom range) to an
 * ISO `YYYY-MM-DD` `{ from, to }` pair suitable for an API contract such as
 * `/api/admin/histories`'s `createdAtFrom` / `createdAtTo`.
 *
 * Preset keys mirror the defaults emitted by `<app-period-filter>`:
 * - `''`        — no constraint (both `undefined`)
 * - `'today'`   — today only
 * - `'7days'`   — last 7 days inclusive (today − 6 → today)
 * - `'30days'`  — last 30 days inclusive (today − 29 → today)
 * - `'custom'`  — pass through the user-picked range as-is
 *
 * Unknown preset keys collapse to `{ undefined, undefined }`. The custom
 * range is forwarded verbatim — callers that need slash → dash conversion
 * (e.g. their API service) should do that at the wire boundary.
 */
export function resolvePeriodRange(
  period: string,
  custom: PeriodRange | null,
): { from: string | undefined; to: string | undefined } {
  if (period === 'custom') {
    return {
      from: custom?.from || undefined,
      to: custom?.to || undefined,
    };
  }
  if (!period) return { from: undefined, to: undefined };

  const today = new Date();
  const todayStr = formatIsoDate(today);
  if (period === 'today') return { from: todayStr, to: todayStr };

  const offset = period === '7days' ? 6 : period === '30days' ? 29 : null;
  if (offset === null) return { from: undefined, to: undefined };

  const start = new Date(today);
  start.setDate(start.getDate() - offset);
  return { from: formatIsoDate(start), to: todayStr };
}

function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
