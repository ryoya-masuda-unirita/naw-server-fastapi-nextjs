import { describe, expect, it } from 'vitest';
import {
  normalizeLibraryListResponse,
  normalizeLibraryRoomListResponse,
} from './library-api-normalize.util';

describe('normalizeLibraryListResponse', () => {
  it('maps Spring Page nested in data', () => {
    const result = normalizeLibraryListResponse({
      data: {
        content: [
          {
            id: '1',
            title: 'Library A',
            tags: [{ name: 'tag-1' }],
            updatedAt: '2025-09-29T00:00:00.000Z',
            updatedBy: 'Tester',
            contentType: 'video',
          },
        ],
        totalElements: 1,
        number: 0,
        size: 20,
      },
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe('Library A');
    expect(result.data[0]?.tags).toEqual(['tag-1']);
    expect(result.data[0]?.creator).toBe('Tester');
    expect(result.data[0]?.contentType).toBe('video');
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('maps legacy mock list shape', () => {
    const result = normalizeLibraryListResponse({
      data: [
        {
          id: '2',
          name: 'Legacy Item',
          tags: ['a'],
          createdDate: '2025-09-29T00:00:00.000Z',
          creator: 'Author',
          contentType: 'document',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
    });

    expect(result.data[0]?.name).toBe('Legacy Item');
    expect(result.total).toBe(1);
  });
});

describe('normalizeLibraryRoomListResponse', () => {
  it('returns data array for room list endpoint', () => {
    const rows = [{ id: '1', title: 'Room item' }];
    expect(normalizeLibraryRoomListResponse({ data: rows })).toEqual(rows);
  });
});
