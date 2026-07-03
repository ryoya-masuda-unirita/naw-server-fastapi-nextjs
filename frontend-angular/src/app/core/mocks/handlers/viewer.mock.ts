import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_TAG_ITEMS } from '../../constants/mock-data/tags.mock';
import {
  MOCK_VIEWER_CONTENT,
  MOCK_VIEWER_LIST,
} from '../../constants/mock-data/viewer-content.mock';
import type { MockRoute } from '../api-mock';
import type { LibraryTag } from '@app-types/chat/library-api.type';

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return body as Record<string, unknown>;
}

const MOCK_LIBRARY_TAGS: LibraryTag[] = MOCK_TAG_ITEMS.map((tag) => ({
  id: tag.id,
  tenantId: 'tenant-dev-001',
  name: tag.name,
  description: tag.description ?? null,
  createdAt: tag.updatedAt,
  updatedAt: tag.updatedAt,
}));

export const viewerMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.LIBRARIES.TAGS,
    handler: () => [200, { tags: [...MOCK_LIBRARY_TAGS] }],
  },
  {
    method: 'GET',
    match: /^\/libraries\/[^/]+\/list$/,
    handler: () => [200, { data: MOCK_VIEWER_LIST }],
  },
  {
    method: 'PUT',
    match: /^\/libraries\/[^/]+$/,
    handler: (url, body) => {
      const id = url.split('/').at(-1) ?? '';
      const b = parseBody(body);
      const name = b['name'] as string | undefined;
      if (name) {
        const item = MOCK_VIEWER_LIST.find((v) => v.id === id);
        if (item) {
          item.title = name;
        }
      }
      return [200, { data: { id } }];
    },
  },
  {
    method: 'GET',
    match: /^\/libraries\/([^/]+)$/,
    handler: (url) => {
      const id = url.split('/').at(-1) ?? '';
      const item = MOCK_VIEWER_LIST.find((v) => v.id === id);
      return [200, { title: item?.title ?? '', data: MOCK_VIEWER_CONTENT }];
    },
  },
];
