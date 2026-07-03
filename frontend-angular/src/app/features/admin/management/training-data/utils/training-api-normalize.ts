import type {
  TrainingDataApiItem,
  TrainingDataApiResponse,
  TrainingDataFile,
  TrainingDataFileApiResponse,
  TrainingDataFileFilter,
  TrainingDataFilter,
} from '@app-types/training-data.types';
import { fromSplitLength } from './training-data-chunk-size.helper';

/** Wire format for GET/POST/PATCH /api/admin/indexes (Index + description). */
interface SpringIndexRow {
  id?: string;
  tenantId?: string;
  name?: string;
  description?: string;
  type?: 'SAAS_GLOBAL' | 'LOCAL' | string;
  add?: string;
  delete?: string;
  get?: string;
  createdAt?: string;
  updatedAt?: string;
  tenantEndpoints?: Array<{ id?: string }>;
  files?: TrainingDataApiItem['files'];
}

interface SpringPageIndex {
  content: SpringIndexRow[];
  totalElements: number;
  size: number;
  number: number;
}

interface LegacyListBody {
  data?: SpringIndexRow[];
  total?: number;
  page?: number;
  size?: number;
}

function isSpringPage(body: unknown): body is SpringPageIndex {
  return (
    typeof body === 'object' &&
    body !== null &&
    'content' in body &&
    Array.isArray((body as SpringPageIndex).content) &&
    typeof (body as SpringPageIndex).totalElements === 'number'
  );
}

function normalizeIndexType(type: unknown): TrainingDataApiItem['type'] {
  return String(type ?? 'LOCAL').toUpperCase() === 'SAAS_GLOBAL' ? 'SAAS_GLOBAL' : 'LOCAL';
}

export function springIndexRowToTrainingDataApiItem(row: SpringIndexRow): TrainingDataApiItem {
  const endpointIds =
    row.tenantEndpoints?.map((endpoint) => String(endpoint.id ?? '').trim()).filter(Boolean) ?? [];

  return {
    id: String(row.id ?? '').trim(),
    name: String(row.name ?? '').trim(),
    description: String(row.description ?? '').trim(),
    type: normalizeIndexType(row.type),
    updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
    add: row.add,
    delete: row.delete,
    get: row.get,
    endpointIds,
    files: row.files,
  };
}

/** Spring `Page<Index>` → internal list response (`data` / `total` / 1-based `page`). */
export function normalizeTrainingDataListBody(
  raw: unknown,
  filter: TrainingDataFilter,
): TrainingDataApiResponse {
  if (isSpringPage(raw)) {
    return {
      data: raw.content.map(springIndexRowToTrainingDataApiItem),
      total: raw.totalElements,
      page: raw.number + 1,
      size: raw.size,
    };
  }

  const legacy = raw as LegacyListBody;
  if (legacy.data && typeof legacy.total === 'number') {
    return {
      data: legacy.data.map(springIndexRowToTrainingDataApiItem),
      total: legacy.total,
      page: (legacy.page ?? 0) + 1,
      size: legacy.size ?? legacy.data.length,
    };
  }

  return { data: [], total: 0, page: 1, size: filter.pageSize };
}

export function normalizeTrainingDataIndexBody(raw: unknown): TrainingDataApiItem {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return springIndexRowToTrainingDataApiItem(raw as SpringIndexRow);
  }

  return {
    id: '',
    name: '',
    description: '',
    type: 'LOCAL',
    updatedAt: new Date().toISOString(),
  };
}

interface SpringFileRow {
  id?: string;
  name?: string;
  displayName?: string;
  reference?: string;
  status?: string;
  userId?: string;
  updatedAt?: string;
  updatedBy?: string;
  splitLength?: string;
}

interface SpringPageFile {
  content: SpringFileRow[];
  totalElements: number;
  size: number;
  number: number;
}

interface LegacyFileListBody {
  data?: SpringFileRow[];
  total?: number;
  page?: number;
  size?: number;
}

function normalizeFileStatus(status: unknown): TrainingDataFile['status'] {
  const value = String(status ?? 'DISABLE').toUpperCase();
  if (value === 'ENABLE' || value === 'DELETED') return value;
  return 'DISABLE';
}

export function springFileRowToTrainingDataFile(row: SpringFileRow): TrainingDataFile {
  return {
    id: String(row.id ?? '').trim(),
    displayName: String(row.displayName ?? '').trim(),
    name: String(row.name ?? '').trim(),
    updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
    updatedBy: String(row.updatedBy ?? row.userId ?? '').trim(),
    userId: row.userId,
    status: normalizeFileStatus(row.status),
    chunkSize: fromSplitLength(row.splitLength),
    reference: row.reference,
  };
}

function isSpringFilePage(body: unknown): body is SpringPageFile {
  return (
    typeof body === 'object' &&
    body !== null &&
    'content' in body &&
    Array.isArray((body as SpringPageFile).content) &&
    typeof (body as SpringPageFile).totalElements === 'number'
  );
}

/** Spring `Page<File>` → internal file list response. */
export function normalizeTrainingDataFileListBody(
  raw: unknown,
  filter: TrainingDataFileFilter,
): TrainingDataFileApiResponse {
  if (isSpringFilePage(raw)) {
    return {
      data: raw.content.map(springFileRowToTrainingDataFile),
      total: raw.totalElements,
      page: raw.number + 1,
      size: raw.size,
    };
  }

  const legacy = raw as LegacyFileListBody;
  if (legacy.data && typeof legacy.total === 'number') {
    return {
      data: legacy.data.map(springFileRowToTrainingDataFile),
      total: legacy.total,
      page: (legacy.page ?? 0) + 1,
      size: legacy.size ?? legacy.data.length,
    };
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'id' in (raw as object)) {
    const file = springFileRowToTrainingDataFile(raw as SpringFileRow);
    return { data: [file], total: 1, page: 1, size: 1 };
  }

  return { data: [], total: 0, page: 1, size: filter.pageSize };
}

export function normalizeTrainingDataFileBody(raw: unknown): TrainingDataFile {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return springFileRowToTrainingDataFile(raw as SpringFileRow);
  }

  return {
    id: '',
    displayName: '',
    name: '',
    updatedAt: new Date().toISOString(),
    updatedBy: '',
    status: 'DISABLE',
  };
}
