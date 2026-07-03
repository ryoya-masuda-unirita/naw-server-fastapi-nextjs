import type { UserApiItem } from '@app-types/admin/user.types';
import type { SelectOption } from '@app-types/common';
import type {
  TrainingDataFile,
  TrainingDataFileFilter,
  TrainingDataFileSortField,
} from '@app-types/training-data.types';
import type { PeriodRange } from '@shared/components/filter/period-filter/period-filter.component';

export interface TrainingDataFileListApiParams {
  page: number;
  size: number;
  userId?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  displayName?: string;
  fileName?: string;
  status?: 'ENABLE' | 'DISABLE' | 'DELETED';
  sort?: string;
}

function mapUiStatusToApi(
  status: string | null | undefined,
): TrainingDataFileListApiParams['status'] | undefined {
  if (!status) return undefined;
  const upper = status.toUpperCase();
  if (upper === 'ON') return 'ENABLE';
  if (upper === 'OFF') return 'DISABLE';
  if (upper === 'ENABLE' || upper === 'DISABLE' || upper === 'DELETED') {
    return upper;
  }
  return undefined;
}

function mapPeriodToDateRange(
  period: string | null | undefined,
  range: PeriodRange | null | undefined,
): { from?: string; to?: string } {
  if (range?.from || range?.to) {
    return {
      from: range.from ? new Date(range.from).toISOString() : undefined,
      to: range.to ? new Date(range.to).toISOString() : undefined,
    };
  }

  if (!period) return {};

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'today') {
    return { from: startOfToday.toISOString(), to: now.toISOString() };
  }

  if (period === '7days') {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (period === '30days') {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  return {};
}

export function mapFileSortFieldToApi(field: TrainingDataFileSortField): string {
  return field === 'updatedBy' ? 'userId' : field;
}

/** Store filter → API query params for GET /admin/indexes/{id}/files. */
export function toFileListApiParams(
  filter: TrainingDataFileFilter,
  currentUserId?: string,
): TrainingDataFileListApiParams {
  const dateRange = mapPeriodToDateRange(filter.selectedPeriod, filter.filterPeriodRange);
  const query = filter.query?.trim();
  let userId: string | undefined;

  if (filter.userId && filter.userId !== '') {
    userId = filter.userId === 'me' ? currentUserId : filter.userId;
  }

  const sort = filter.sortField
    ? `${mapFileSortFieldToApi(filter.sortField)},${filter.sortOrder || 'desc'}`
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

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
