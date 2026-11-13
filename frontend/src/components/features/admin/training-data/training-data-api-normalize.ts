import type { PagedResponse } from '@/types/api-response.type';
import type {
  TrainingDataApiItem,
  TrainingDataApiResponse,
  TrainingDataFile,
  TrainingDataFileApiResponse,
  TrainingDataItem,
} from '@/types/training-data.types';
import { fromSplitLength } from './training-data-chunk-size';

/** `GET /api/admin/indexes` の 1 件（backend の `IndexResponse` のうち使う項目） */
export interface IndexRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  add: string | null;
  delete: string | null;
  get: string | null;
  createdAt: string;
  updatedAt: string;
  /** backend は `endpointIds` ではなく、接続先をオブジェクトの配列で返す */
  tenantEndpoints: { id: string }[];
  groupIds: string[];
}

/** 種別を画面で扱う 2 種類に寄せる（移植元 `normalizeIndexType`）。`SAAS_GLOBAL` 以外はすべて `LOCAL` */
function normalizeIndexType(type: string): TrainingDataApiItem['type'] {
  return type.toUpperCase() === 'SAAS_GLOBAL' ? 'SAAS_GLOBAL' : 'LOCAL';
}

/** backend のインデックス 1 件を画面の型へ変える（移植元 `springIndexRowToTrainingDataApiItem`）。`endpointIds` は `tenantEndpoints[].id` から作る */
export function indexRowToApiItem(row: IndexRow): TrainingDataApiItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    type: normalizeIndexType(row.type),
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    add: row.add ?? undefined,
    delete: row.delete ?? undefined,
    get: row.get ?? undefined,
    endpointIds: row.tenantEndpoints.map((endpoint) => endpoint.id),
    groupIds: row.groupIds,
  };
}

/** 一覧の応答（Spring の `Page`）を、画面の形（`data`・`total`・1 始まりの `page`）へ変える */
export function normalizeTrainingDataListBody(
  raw: PagedResponse<IndexRow>,
): TrainingDataApiResponse {
  return {
    data: raw.content.map(indexRowToApiItem),
    total: raw.totalElements,
    page: raw.number + 1,
    size: raw.size,
  };
}

/** 一覧のカードに出す内容へ変える（移植元 `toViewModel`）。接続サーバーの表示は移植元でも日本語の固定文字列 */
export function toTrainingDataItem(item: TrainingDataApiItem): TrainingDataItem {
  const isCloud = item.type === 'SAAS_GLOBAL';
  return {
    id: item.id,
    folder: item.name,
    server: isCloud ? 'クラウド' : 'ローカル',
    desc: item.description ?? '',
    link: isCloud ? 'learningdata-cloud' : 'learningdata-local',
    updatedAt: item.updatedAt,
  };
}

/** backend の `FileResponse` のうち使う項目。移植元の型（`displayName`・`updatedBy`・`splitLength`）と違い、`fileName` を返し、`splitLength` は返さない */
export interface FileRow {
  id: string;
  fileName: string;
  displayName: string | null;
  reference: string | null;
  status: string;
  userId: string;
  updatedAt: string;
  updatedBy: string | null;
  splitLength?: string | number | null;
}

/** 状態を画面の 3 値に寄せる。未知の値は学習に使わない扱い（移植元 `normalizeFileStatus`） */
function normalizeFileStatus(status: string): TrainingDataFile['status'] {
  const value = status.toUpperCase();
  if (value === 'ENABLE' || value === 'DELETED') return value;
  return 'DISABLE';
}

/**
 * backend のファイル 1 件を画面の型へ変える（移植元 `springFileRowToTrainingDataFile`）。
 * 表示名が無いファイルは、ファイル名を表示名にする。
 */
export function fileRowToTrainingDataFile(row: FileRow): TrainingDataFile {
  return {
    id: row.id,
    displayName: (row.displayName ?? row.fileName).trim(),
    updatedAt: row.updatedAt,
    updatedBy: (row.updatedBy ?? row.userId).trim(),
    userId: row.userId,
    status: normalizeFileStatus(row.status),
    chunkSize: fromSplitLength(row.splitLength),
    reference: row.reference ?? undefined,
  };
}

/** ファイル一覧の応答（Spring の `Page`）を、画面の形へ変える */
export function normalizeTrainingDataFileListBody(
  raw: PagedResponse<FileRow>,
): TrainingDataFileApiResponse {
  return {
    data: raw.content.map(fileRowToTrainingDataFile),
    total: raw.totalElements,
    page: raw.number + 1,
    size: raw.size,
  };
}
