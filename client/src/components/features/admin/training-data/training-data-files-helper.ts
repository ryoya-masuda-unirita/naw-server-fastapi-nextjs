import { resolvePeriodRange, toDateTimeRange } from '@/components/shared/period-filter-utils';
import type {
  TrainingDataFile,
  TrainingDataFileFilter,
  TrainingDataFileRow,
  TrainingDataFileSortField,
  TrainingDataFileUpdater,
} from '@/types/training-data.types';

// 移植元 training-data/utils/training-data-files.helper.ts

/** ファイルを学習に使っていないときの既定（未指定の並べ替え方向） */
const DEFAULT_SORT_ORDER = 'desc';

/** `GET /api/admin/indexes/{id}/files` のクエリ */
export interface TrainingDataFileListApiParams {
  page: number;
  size: number;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  displayName?: string;
  fileName?: string;
  sort?: string;
}

/**
 * 更新者名順は、API では `userId` で並べる。
 * 画面からは並べ替えを外した（NAW-1427）が、並べ替えを作り直すときのために、移植元と同じく残している
 */
export function mapFileSortFieldToApi(field: TrainingDataFileSortField): string {
  return field === 'updatedBy' ? 'userId' : field;
}

/** 画面の絞り込み条件を、ファイル一覧 API のクエリにする */
export function toFileListApiParams(
  filter: TrainingDataFileFilter,
): TrainingDataFileListApiParams {
  const dateRange = toDateTimeRange(
    resolvePeriodRange(filter.selectedPeriod ?? '', filter.filterPeriodRange ?? null),
  );
  const query = filter.query?.trim();
  const sort = filter.sortField
    ? `${mapFileSortFieldToApi(filter.sortField)},${filter.sortOrder || DEFAULT_SORT_ORDER}`
    : undefined;

  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    updatedAtFrom: dateRange.from,
    updatedAtTo: dateRange.to,
    displayName: query || undefined,
    fileName: query || undefined,
    sort,
  };
}

function resolveFileUpdater(file: TrainingDataFile): TrainingDataFileUpdater {
  if (!file.userId) return { kind: 'UNKNOWN' };
  return file.updatedBy ? { kind: 'USER', name: file.updatedBy } : { kind: 'DELETED' };
}

/**
 * 一覧の更新者の欄を決める（移植元 `resolveFileUpdaters`）。
 * 名前があれば名前、更新者の ID はあるが名前が無ければ「削除されたユーザー」、ID が無ければ「Unknown」。
 * 名前（`updatedBy`）は、クラウドは API が返し、ローカルは一覧を取るときにログイン ID から引く。
 */
export function resolveFileUpdaters(files: TrainingDataFile[]): TrainingDataFileRow[] {
  return files.map((file) => ({ ...file, updater: resolveFileUpdater(file) }));
}

/** ダウンロードの開始を待ってから URL を失効させるまでの時間 */
const REVOKE_DELAY_MS = 1000;

/** ブラウザのダウンロードを起こす */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  // 古いブラウザは DOM に無いリンクのクリックを無視し、開始前に URL を失効させるとダウンロードが空になる
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** 一覧の「更新日時」の表示（移植元の `date: 'yyyy/MM/dd HH:mm'`）。解釈できない値は空にする */
export function formatDateTimeMinutes(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}/${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
