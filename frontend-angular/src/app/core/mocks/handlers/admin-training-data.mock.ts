import { MockRoute } from '../api-mock';
import { MOCK_TRAINING_INDEXES } from '../../constants/mock-data/training-data.mock';
import type { TrainingDataApiItem, TrainingDataFile } from '@app-types/training-data.types';

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

function getIndexFiles(indexId: string): TrainingDataFile[] {
  const item = MOCK_TRAINING_INDEXES.find((r) => r.id === indexId);
  return item?.files ?? [];
}

function filterFiles(
  files: TrainingDataFile[],
  params: Record<string, string>,
): TrainingDataFile[] {
  const displayName = (params['displayName'] ?? '').toLowerCase();
  const fileName = (params['fileName'] ?? '').toLowerCase();
  const userId = params['userId'];
  const status = params['status'];
  const updatedAtFrom = params['updatedAtFrom'] ? new Date(params['updatedAtFrom']) : null;
  const updatedAtTo = params['updatedAtTo'] ? new Date(params['updatedAtTo']) : null;

  return files.filter((file) => {
    if (displayName || fileName) {
      const q = displayName || fileName;
      const matchesDisplay = file.displayName.toLowerCase().includes(q);
      const matchesName = file.name.toLowerCase().includes(q);
      if (!matchesDisplay && !matchesName) return false;
    }

    if (userId && file.userId !== userId && file.updatedBy !== userId) {
      return false;
    }

    if (status && file.status !== status) {
      return false;
    }

    if (updatedAtFrom || updatedAtTo) {
      const updatedAt = new Date(file.updatedAt);
      if (updatedAtFrom && updatedAt < updatedAtFrom) return false;
      if (updatedAtTo && updatedAt > updatedAtTo) return false;
    }

    return true;
  });
}

function sortFiles(files: TrainingDataFile[], params: Record<string, string>): TrainingDataFile[] {
  const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');
  const dir = sortDir === 'asc' ? 1 : -1;

  return [...files].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'userId' || sortField === 'updatedBy') {
      cmp = String(a.updatedBy ?? a.userId ?? '').localeCompare(
        String(b.updatedBy ?? b.userId ?? ''),
      );
    } else if (sortField === 'displayName') {
      cmp = a.displayName.localeCompare(b.displayName);
    } else if (sortField === 'status') {
      cmp = a.status.localeCompare(b.status);
    } else {
      cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    return cmp * dir;
  });
}

export const adminTrainingDataMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: '/admin/indexes',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '5', 10);
      const q = (params['searchText'] ?? params['q'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      let rows = [...MOCK_TRAINING_INDEXES];
      if (q) {
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
        );
      }

      rows.sort((a, b) => {
        const aV = sortField === 'name' ? a.name : sortField === 'type' ? a.type : a.updatedAt;
        const bV = sortField === 'name' ? b.name : sortField === 'type' ? b.type : b.updatedAt;
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const content = rows.slice(start, start + size);
      return [
        200,
        {
          content,
          totalElements: rows.length,
          number: page,
          size,
          first: page === 0,
          last: start + size >= rows.length,
        },
      ];
    },
  },
  {
    method: 'POST',
    match: '/admin/indexes',
    handler: (_url, body) => {
      const b = parseBody(body);
      const id = `idx-${Date.now()}`;
      const newItem: TrainingDataApiItem = {
        id,
        name: String(b['name'] ?? 'New Folder'),
        description: String(b['description'] ?? ''),
        type: (b['type'] as TrainingDataApiItem['type']) ?? 'LOCAL',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        get: b['get'] as string | undefined,
        add: b['add'] as string | undefined,
        delete: b['delete'] as string | undefined,
        files: [],
      };
      MOCK_TRAINING_INDEXES.unshift(newItem);
      return [201, newItem];
    },
  },
  {
    method: 'GET',
    match: /^\/admin\/indexes\/[^/]+$/,
    handler: (url) => {
      const id = url.split('/').at(-1) ?? '';
      const item = MOCK_TRAINING_INDEXES.find((r) => r.id === id);
      if (!item) return [404, { message: 'Item not found' }];
      return [200, item];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/indexes\/[^/]+$/,
    handler: (url, body) => {
      const id = url.split('/').at(-1) ?? '';
      const idx = MOCK_TRAINING_INDEXES.findIndex((r) => r.id === id);
      if (idx === -1) return [404, { message: 'Item not found' }];
      const b = parseBody(body);
      MOCK_TRAINING_INDEXES[idx] = {
        ...MOCK_TRAINING_INDEXES[idx],
        ...b,
        updatedAt: new Date().toISOString(),
      };
      return [200, MOCK_TRAINING_INDEXES[idx]];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/indexes\/[^/]+$/,
    handler: (url) => {
      const id = url.split('/').at(-1) ?? '';
      const idx = MOCK_TRAINING_INDEXES.findIndex((r) => r.id === id);
      if (idx !== -1) {
        MOCK_TRAINING_INDEXES.splice(idx, 1);
      }
      return [204, null];
    },
  },
  {
    method: 'POST',
    match: /^\/admin\/indexes\/[^/]+\/sync$/,
    handler: () => [200, { message: 'Sync started' }],
  },
  {
    method: 'GET',
    match: /^\/admin\/indexes\/[^/]+\/files$/,
    handler: (url, _body, params) => {
      const id = url.split('/').at(-2) ?? '';
      const item = MOCK_TRAINING_INDEXES.find((r) => r.id === id);
      if (!item) return [404, { message: 'Item not found' }];

      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const rows = sortFiles(filterFiles(getIndexFiles(id), params), params);
      const start = page * size;
      const content = rows.slice(start, start + size).map((file) => ({
        ...file,
        splitLength: file.chunkSize,
      }));

      return [
        200,
        {
          content,
          totalElements: rows.length,
          number: page,
          size,
          first: page === 0,
          last: start + size >= rows.length,
        },
      ];
    },
  },
  {
    method: 'POST',
    match: /^\/admin\/indexes\/[^/]+\/files$/,
    handler: (url, body, params) => {
      const id = url.split('/').at(-2) ?? '';
      const item = MOCK_TRAINING_INDEXES.find((r) => r.id === id);
      if (!item) return [404, { message: 'Item not found' }];

      const b = parseBody(body);
      const uploadedFile = b['file'] instanceof File ? (b['file'] as File) : null;
      const newFile: TrainingDataFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        displayName: String(params['displayName'] ?? uploadedFile?.name ?? 'New File'),
        name: String(params['name'] ?? uploadedFile?.name ?? 'new-file.docx'),
        updatedAt: new Date().toISOString(),
        updatedBy: '苗字 名前',
        status: (params['status'] as TrainingDataFile['status']) ?? 'ENABLE',
        chunkSize: params['splitLength'],
        reference: params['reference'],
      };
      item.files = [newFile, ...(item.files ?? [])];
      return [201, { ...newFile, splitLength: newFile.chunkSize }];
    },
  },
  {
    method: 'GET',
    match: /^\/admin\/indexes\/[^/]+\/files\/[^/]+$/,
    handler: (url) => {
      const parts = url.split('/');
      const id = parts.at(-3) ?? '';
      const fileId = parts.at(-1) ?? '';
      const file = getIndexFiles(id).find((f) => f.id === fileId);
      if (!file) return [404, { message: 'File not found' }];
      return [200, new Blob([`Mock content for ${file.displayName}`], { type: 'text/plain' })];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/indexes\/[^/]+\/files\/[^/]+$/,
    handler: (url) => {
      const parts = url.split('/');
      const id = parts.at(-3) ?? '';
      const fileId = parts.at(-1) ?? '';
      const item = MOCK_TRAINING_INDEXES.find((r) => r.id === id);
      if (!item) return [404, { message: 'Item not found' }];
      item.files = (item.files ?? []).filter((f) => f.id !== fileId);
      return [204, null];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/indexes\/[^/]+\/files\/[^/]+$/,
    handler: (url, body, params) => {
      const parts = url.split('/');
      const id = parts.at(-3) ?? '';
      const fileId = parts.at(-1) ?? '';
      const item = MOCK_TRAINING_INDEXES.find((r) => r.id === id);
      if (!item) return [404, { message: 'Item not found' }];
      const file = (item.files ?? []).find((f) => f.id === fileId);
      if (!file) return [404, { message: 'File not found' }];

      const b = parseBody(body);
      const uploadedFile = b['file'] instanceof File ? (b['file'] as File) : null;
      Object.assign(file, {
        displayName: params['displayName'] ?? file.displayName,
        name: params['name'] ?? (uploadedFile?.name || file.name),
        chunkSize: params['splitLength'] ?? file.chunkSize,
        reference: params['reference'] ?? file.reference,
        status: (params['status'] as TrainingDataFile['status']) ?? file.status,
        updatedAt: new Date().toISOString(),
      });

      return [200, { ...file, splitLength: file.chunkSize }];
    },
  },
];
