import { resolvePeriodRange, toDateTimeRange } from '@/components/shared/period-filter-utils';
import type { SelectOption } from '@/components/shared/types';
import type { UserApiItem } from '@/types/admin/user.types';
import type {
  TrainingDataFile,
  TrainingDataFileFilter,
  TrainingDataFileSortField,
} from '@/types/training-data.types';

// 移植元 training-data/utils/training-data-files.helper.ts

/** ファイルを学習に使っていないときの既定（未指定の並べ替え方向） */
const DEFAULT_SORT_ORDER = 'desc';

type ApiFileStatus = 'ENABLE' | 'DISABLE' | 'DELETED';

/** `GET /api/admin/indexes/{id}/files` のクエリ */
export interface TrainingDataFileListApiParams {
  page: number;
  size: number;
  userId?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  displayName?: string;
  fileName?: string;
  status?: ApiFileStatus;
  sort?: string;
}

function mapUiStatusToApi(status: string | null | undefined): ApiFileStatus | undefined {
  if (!status) return undefined;
  const upper = status.toUpperCase();
  if (upper === 'ON') return 'ENABLE';
  if (upper === 'OFF') return 'DISABLE';
  if (upper === 'ENABLE' || upper === 'DISABLE' || upper === 'DELETED') return upper;
  return undefined;
}

/** 更新者名順は、API では `userId` で並べる */
export function mapFileSortFieldToApi(field: TrainingDataFileSortField): string {
  return field === 'updatedBy' ? 'userId' : field;
}

/** 画面の絞り込み条件を、ファイル一覧 API のクエリにする */
export function toFileListApiParams(
  filter: TrainingDataFileFilter,
  currentUserId?: string,
): TrainingDataFileListApiParams {
  const dateRange = toDateTimeRange(
    resolvePeriodRange(filter.selectedPeriod ?? '', filter.filterPeriodRange ?? null),
  );
  const query = filter.query?.trim();
  let userId: string | undefined;

  if (filter.userId && filter.userId !== '') {
    userId = filter.userId === 'me' ? currentUserId : filter.userId;
  }

  const sort = filter.sortField
    ? `${mapFileSortFieldToApi(filter.sortField)},${filter.sortOrder || DEFAULT_SORT_ORDER}`
    : undefined;

  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    userId,
    updatedAtFrom: dateRange.from,
    updatedAtTo: dateRange.to,
    displayName: query || undefined,
    fileName: query || undefined,
    status: mapUiStatusToApi(filter.selectedStatus),
    sort,
  };
}

/** 更新者の絞り込みの選択肢（全員・自分だけ・各ユーザー） */
export function buildFileUserFilterOptions(
  users: UserApiItem[],
  translate: (key: string) => string,
): SelectOption[] {
  return [
    { value: '', label: translate('LEARNING_DATA.ALL_USERS') },
    { value: 'me', label: translate('CHAT_HISTORY.ONLY_ME') },
    ...users.map((user) => ({ value: user.id, label: user.displayName })),
  ];
}

/** 更新者の欄を、ユーザー ID からユーザーの表示名に置き換える。見つからなければそのまま */
export function resolveFileUpdatedByNames(
  files: TrainingDataFile[],
  users: UserApiItem[],
): TrainingDataFile[] {
  const nameById = new Map(users.map((user) => [user.id, user.displayName]));

  return files.map((file) => {
    const lookupKey = file.userId ?? file.updatedBy;
    const displayName = lookupKey ? nameById.get(lookupKey) : undefined;
    return displayName ? { ...file, updatedBy: displayName } : file;
  });
}

/** ブラウザのダウンロードを起こす */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 追加ではスイッチを表示しないため、ファイルが無いときは学習に使う状態（オン）で登録する */
export function initialLearningEnabled(file: TrainingDataFile | undefined): boolean {
  return file ? file.status === 'ENABLE' : true;
}

/** 一覧の「更新日時」の表示（移植元の `date: 'yyyy/MM/dd HH:mm'`）。解釈できない値は空にする */
export function formatDateTimeMinutes(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}/${pad(parsed.getMonth() + 1)}/${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
