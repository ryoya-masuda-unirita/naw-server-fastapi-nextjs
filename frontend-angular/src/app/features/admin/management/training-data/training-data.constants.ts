import { TrainingDataFileFilter, TrainingDataFilter } from '@app-types/training-data.types';

export const TRAINING_DATA_API_PATH = {
  LIST: '/admin/indexes',
  DETAIL: (id: string) => `/admin/indexes/${id}`,
  SYNC: (id: string) => `/admin/indexes/${id}/sync`,
  FILES: (id: string) => `/admin/indexes/${id}/files`,
  FILE: (indexId: string, fileId: string) => `/admin/indexes/${indexId}/files/${fileId}`,
  ENDPOINTS_BY_TYPE: (type: string) => `/admin/tenants/endpoints/${type}`,
  GROUPS: '/admin/groups',
} as const;

export const TRAINING_FOLDER_GROUP_PAGE_SIZE = 100;

export const DEFAULT_TRAINING_DATA_FILTER: TrainingDataFilter = {
  pageSize: 5,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

export const DEFAULT_TRAINING_DATA_FILE_FILTER: TrainingDataFileFilter = {
  query: '',
  userId: '',
  selectedPeriod: null,
  filterPeriodRange: null,
  selectedStatus: null,
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

export const TRAINING_DATA_SORT_OPTIONS = [
  { value: 'updatedAt', label: 'LEARNING_DATA.SORT_UPDATED_AT' },
  { value: 'name', label: 'LEARNING_DATA.SORT_FOLDER_NAME' },
  { value: 'type', label: 'LEARNING_DATA.SORT_SERVER' },
];
