/** 移植元 filter/period-filter/period-filter.component.ts の PeriodOption / PeriodRange / PeriodChange */
export interface PeriodOption {
  value: string;
  /** i18n キー */
  label: string;
}

export interface PeriodRange {
  from: string;
  to: string;
}

export interface PeriodChange {
  value: string;
  range: PeriodRange | null;
}

/**
 * 移植元 period-filter.utils.ts の resolvePeriodRange。
 * PeriodFilter の選択（プリセットのキー＋任意の期間）を、ブラウザのタイムゾーンでの暦日 `{ from, to }` にする。
 * 日付は時刻もオフセットも持たないので、API に送る前に `toDateTimeRange` で日時にすること。
 *
 * - `''`       — 制約なし（両方 undefined）
 * - `'today'`  — 今日だけ
 * - `'7days'`  — 今日を含む過去 7 日（今日 − 6 → 今日）
 * - `'30days'` — 今日を含む過去 30 日（今日 − 29 → 今日）
 * - `'custom'` — 利用者が選んだ期間をそのまま渡す
 *
 * 未知のキーは両方 undefined。プリセットは `YYYY-MM-DD`、custom は `YYYY/MM/DD` のまま返す。
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

/**
 * 期間の日付を、ブラウザのタイムゾーンでの「開始日の 0:00」と「終了日の翌日 0:00」を表す UTC の日時にする。
 * API サーバーは利用者のタイムゾーンを知らないため、日付のままでは「どこの 1 日か」が決まらない。
 * 終了を翌日の 0:00 にするのは、終了日を丸 1 日含めるため（API サーバーは「より前」で判定する）。
 */
export function toDateTimeRange(range: { from?: string; to?: string }): {
  from?: string;
  to?: string;
} {
  return { from: toStartOfDayIso(range.from, 0), to: toStartOfDayIso(range.to, 1) };
}

// 期間の日付は、選択肢からは `YYYY-MM-DD`、カレンダーからは `YYYY/MM/DD` で届く
const DATE_PATTERN = /^(\d{4})[/-](\d{2})[/-](\d{2})$/;

/**
 * 期間の日付を、ブラウザのタイムゾーンでの 0:00 を表す UTC の日時にする。
 *
 * @param dayOffset 0 ならその日、1 なら翌日の 0:00
 */
function toStartOfDayIso(value: string | undefined, dayOffset: number): string | undefined {
  if (!value) return undefined;
  const match = DATE_PATTERN.exec(value);
  // 日付として読めない値は黙って捨てず、API サーバーの 400 で気づけるようそのまま渡す
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  // 24 時間を足すとサマータイムの切り替え日にずれるため、日付を進めて翌日を作る
  return new Date(year, month - 1, day + dayOffset).toISOString();
}
