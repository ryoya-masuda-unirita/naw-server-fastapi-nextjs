import type { PagedResponse } from '@/types/api-response.type';
import type {
  TrainingDataApiItem,
  TrainingDataApiResponse,
  TrainingDataItem,
} from '@/types/training-data.types';

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
