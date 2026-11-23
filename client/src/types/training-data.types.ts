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
  /** 接続先（`LOCAL_SERVER`）の ID。ローカルの学習先フォルダでだけある。ファイルの操作はこの接続先へ送る */
  localServerEndpointId?: string;
  groupIds?: string[];
  files?: TrainingDataFile[];
}

/** ローカル用サーバーの URL と API キー（移植元 `LocalServerEndpoint`） */
export interface LocalServerEndpoint {
  endpoint: string;
  apiKey: string;
}

export type TrainingDataFileSortField = 'updatedAt' | 'displayName' | 'updatedBy';
export type TrainingDataFileSortOrder = '' | 'asc' | 'desc';

export interface TrainingDataFilePeriodRange {
  from: string;
  to: string;
}

/** File list filter state (store single source). */
export interface TrainingDataFileFilter {
  query?: string;
  selectedPeriod?: string | null;
  filterPeriodRange?: TrainingDataFilePeriodRange | null;
  pageSize: number;
  pageIndex: number;
  sortField?: TrainingDataFileSortField;
  sortOrder?: TrainingDataFileSortOrder;
}

export interface TrainingFileUploadEntry {
  file?: File;
  displayName: string;
  /** チャット時に参照資料のリンクとして使われる名前 */
  reference?: string;
  chunkSize?: string;
}

export interface TrainingDataFile {
  id: string;
  /** 学習データの表示名 */
  displayName: string;
  /** チャット時に参照資料のリンクとして使われる名前 */
  reference?: string;
  updatedAt: string;
  updatedBy: string;
  userId?: string;
  status: 'ENABLE' | 'DISABLE' | 'DELETED';
  chunkSize?: string;
  image?: string;
}

/**
 * 一覧の「更新者」の欄に出すもの。名前を引けないときは、ユーザーの ID を出さずに理由で出し分ける
 * （移植元 `TrainingDataFileUpdater`。SYSTEM ユーザーは更新者にならないため、種類に含めない）。
 */
export type TrainingDataFileUpdater =
  | { kind: 'USER'; name: string }
  | { kind: 'DELETED' }
  | { kind: 'UNKNOWN' };

/** 一覧に出す学習データ。更新者の欄は、フォルダの種類に応じて決める */
export interface TrainingDataFileRow extends TrainingDataFile {
  updater: TrainingDataFileUpdater;
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

/** 追加学習の対象。回答精度タブは `feedbackId`、満足度タブは `roomId` のどちらか一方だけ送る */
export type AdditionalLearningTarget = { feedbackId: string } | { roomId: string };
