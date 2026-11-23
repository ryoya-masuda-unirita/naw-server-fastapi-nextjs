// 移植元は Angular の DatePipe（`yyyy/MM/dd HH:mm`・ローカルタイムゾーン）と DecimalPipe（既定 `1.0-3`・en-US）を使う

const PAD_LENGTH = 2;
const NUMBER_LOCALE = 'en-US';
const MAX_FRACTION_DIGITS = 3;

function pad(value: number): string {
  return String(value).padStart(PAD_LENGTH, '0');
}

/** `yyyy/MM/dd HH:mm`（ローカルタイムゾーン）。日付として読めなければ空文字 */
export function formatUsageDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 3 桁区切り（小数は最大 3 桁） */
export function formatNumber(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: MAX_FRACTION_DIGITS });
}
