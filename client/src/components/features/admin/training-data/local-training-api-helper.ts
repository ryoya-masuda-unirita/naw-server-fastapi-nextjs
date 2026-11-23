import { resolvePeriodRange } from '@/components/shared/period-filter-utils';
import type { TrainingDataFileFilter } from '@/types/training-data.types';

// 移植元 training-data/utils/local-training-api.helper.ts

/** ローカル用サーバーのファイル一覧が受け取る条件（クラウドと違い、更新者・並べ替え・ファイル名の検索・学習設定は無い） */
export interface LocalFileListApiParams {
  page: number;
  size: number;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  displayName?: string;
}

// 期間の日付は、選択肢からは `YYYY-MM-DD`、カレンダーからは `YYYY/MM/DD` で届く
const DATE_PATTERN = /^(\d{4})[/-](\d{2})[/-](\d{2})$/;

/**
 * 接続先の URL にローカル用サーバーのパスを付ける。
 * 接続先がパスを持つ場合（`https://host/secuaigent` など）に、そのパスを残すため末尾に `/` を補う。
 */
export function buildLocalServerUrl(endpoint: string, path: string): string {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  return new URL(path, base).toString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 期間の日付を `yyyy-MM-dd` にする。日付として読めない値は、黙って捨てず
 * ローカル用サーバーの 400 で気づけるようそのまま渡す。
 *
 * @param dayOffset 0 ならその日、1 なら翌日
 */
function toLocalDate(value: string | undefined, dayOffset: number): string | undefined {
  if (!value) return undefined;
  const match = DATE_PATTERN.exec(value);
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  // 24 時間を足さず、日付を進めて翌日を作る（月末・年末・うるう日の繰り上げをタイムゾーンに左右されず行う）
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * ファイル一覧の条件を、ローカル用サーバーの形にする。
 * ローカル用サーバーは期間を日付（`yyyy-MM-dd`）でしか受け取らず、終了を「その日の 0:00 以前」で比べるため、
 * 終了日を丸 1 日含めるよう翌日の日付を送る。
 */
export function toLocalFileListParams(filter: TrainingDataFileFilter): LocalFileListApiParams {
  const range = resolvePeriodRange(filter.selectedPeriod ?? '', filter.filterPeriodRange ?? null);
  const query = filter.query?.trim();

  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    updatedAtFrom: toLocalDate(range.from, 0),
    updatedAtTo: toLocalDate(range.to, 1),
    displayName: query || undefined,
  };
}

/** ローカル用サーバーへ送る multipart の項目。`undefined` と空文字の項目は送らない */
export type LocalFormFields = Record<string, string | Blob | undefined>;

export function toLocalFormData(fields: LocalFormFields): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue;
    formData.append(key, value);
  }
  return formData;
}
