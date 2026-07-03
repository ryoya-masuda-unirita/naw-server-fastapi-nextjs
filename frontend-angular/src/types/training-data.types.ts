export interface TrainingDataItem {
  id: string;
  folder: string;
  server: string;
  desc: string;
  link: string;
  updatedAt: string;
}

export type TrainingDataSortField = 'updatedAt' | 'name' | 'type';
export type TrainingDataSortOrder = '' | 'asc' | 'desc';

export interface TrainingDataFilter {
  query?: string;
  pageSize: number;
  pageIndex: number;
  sortField?: TrainingDataSortField;
  sortOrder?: TrainingDataSortOrder;
}

/** Server contract: /api/admin/indexes list response item. */
export interface TrainingDataApiItem {
  id: string;
  name: string; // From Index schema 'name'
  description: string;
  type: 'SAAS_GLOBAL' | 'LOCAL'; // From Index schema 'type'
  updatedAt: string;
  createdAt?: string;
  add?: string;
  delete?: string;
  get?: string;
  endpointIds?: string[];
  groupIds?: string[];
  files?: TrainingDataFile[];
}

export type TrainingDataFileSortField = 'updatedAt' | 'displayName' | 'updatedBy' | 'status';
export type TrainingDataFileSortOrder = '' | 'asc' | 'desc';

export interface TrainingDataFilePeriodRange {
  from: string;
  to: string;
}

/** File list filter state (store single source). `userId`: `''` | `'me'` | UUID. */
export interface TrainingDataFileFilter {
  query?: string;
  userId?: string;
  selectedPeriod?: string | null;
  filterPeriodRange?: TrainingDataFilePeriodRange | null;
  selectedStatus?: string | null;
  pageSize: number;
  pageIndex: number;
  sortField?: TrainingDataFileSortField;
  sortOrder?: TrainingDataFileSortOrder;
}

export interface TrainingFileUploadEntry {
  file?: File;
  displayName: string;
  name?: string;
  linkName?: string;
  chunkSize?: string;
  status?: 'ENABLE' | 'DISABLE' | 'DELETED' | string;
  reference?: string;
}

export interface TrainingDataFile {
  id: string;
  displayName: string;
  name: string;
  updatedAt: string;
  updatedBy: string;
  userId?: string;
  status: 'ENABLE' | 'DISABLE' | 'DELETED';
  chunkSize?: string;
  reference?: string;
  image?: string;
}

export interface TrainingDataFileApiResponse {
  data: TrainingDataFile[];
  total: number;
  page: number;
  size: number;
}

export interface TrainingDataApiResponse {
  data: TrainingDataApiItem[];
  total: number;
  page: number;
  size: number;
}
