import { LibraryItem, LibraryListResponse } from '@app-types/admin/library.types';
import type { PagedResponse } from '@app-types/api-response.type';

type LibraryContentType = LibraryItem['contentType'];

interface LibraryApiRow {
  id?: string;
  name?: string;
  title?: string;
  tags?: Array<string | { name?: string }>;
  createdDate?: string | Date;
  createdAt?: string;
  updatedAt?: string;
  creator?: string;
  updatedBy?: string;
  userId?: string;
  contentType?: string;
}

function isSpringPage<T>(value: unknown): value is PagedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray((value as PagedResponse<T>).content) &&
    typeof (value as PagedResponse<T>).totalElements === 'number'
  );
}

function normalizeContentType(value: unknown): LibraryContentType {
  const type = String(value ?? 'document').toLowerCase();
  if (type === 'video' || type === 'image' || type === 'audio' || type === 'other') {
    return type;
  }
  return 'document';
}

function normalizeTags(tags: LibraryApiRow['tags']): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === 'string' ? tag : String(tag.name ?? '').trim()))
    .filter(Boolean);
}

function toLibraryItem(row: LibraryApiRow): LibraryItem {
  const dateSource = row.createdDate ?? row.updatedAt ?? row.createdAt;
  const createdDate =
    dateSource instanceof Date ? dateSource : new Date(String(dateSource ?? Date.now()));

  return {
    id: String(row.id ?? '').trim(),
    name: String(row.name ?? row.title ?? '').trim(),
    tags: normalizeTags(row.tags),
    createdDate,
    creator: String(row.creator ?? row.updatedBy ?? row.userId ?? '').trim(),
    contentType: normalizeContentType(row.contentType),
  };
}

/** `GET /libraries` body (`data` is Spring Page) or legacy mock list shape. */
export function normalizeLibraryListResponse(body: unknown): LibraryListResponse {
  if (!body || typeof body !== 'object') {
    return { data: [], total: 0, page: 1, pageSize: 0 };
  }

  const record = body as Record<string, unknown>;
  const data = record['data'];

  if (isSpringPage<LibraryApiRow>(data)) {
    return {
      data: data.content.map(toLibraryItem),
      total: data.totalElements,
      page: data.number + 1,
      pageSize: data.size,
    };
  }

  if (Array.isArray(data) && typeof record['total'] === 'number') {
    const rows = data as LibraryApiRow[];
    return {
      data: rows.map(toLibraryItem),
      total: record['total'],
      page: typeof record['page'] === 'number' ? record['page'] : 1,
      pageSize: typeof record['pageSize'] === 'number' ? record['pageSize'] : rows.length,
    };
  }

  return { data: [], total: 0, page: 1, pageSize: 0 };
}

/** `GET /libraries/{roomId}/list` body (`data` is a plain array). */
export function normalizeLibraryRoomListResponse<T>(body: unknown): T[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as { data?: unknown }).data;
  return Array.isArray(data) ? (data as T[]) : [];
}
