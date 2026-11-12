/**
 * 画面表示用の日付フォーマット（ローカルタイムゾーン）。
 *
 * API から返る日付は文字列・Date のどちらもあり得るため、両方を受け付ける。
 * 値が無い場合・日付として解釈できない場合は空文字を返し、`NaN/NaN/NaN` を画面に出さない。
 *
 * UTC 固定で表示したい場合（請求期間など）は `formatUtcDate`（api-datetime.ts）を使う。
 */
export function formatLocalDate(date?: Date | string | null): string {
  if (!date) return '';

  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}
