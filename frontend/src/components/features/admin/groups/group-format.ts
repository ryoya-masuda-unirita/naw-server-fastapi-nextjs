const pad = (value: number) => String(value).padStart(2, '0');

/**
 * 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。
 * 値がない・日付でないときは空（Angular の date パイプも null で空を返す）。
 *
 * @param value ISO 8601 の日時
 */
export function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 移植元 `GroupUsersTableComponent.formatCredits`。値がなければ「—」、あれば ja-JP の桁区切り。
 *
 * @param value 請求期間内のクレジット
 */
export function formatCredits(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('ja-JP');
}
