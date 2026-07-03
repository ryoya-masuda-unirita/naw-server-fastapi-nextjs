import { describe, expect, it } from 'vitest';
import {
  buildEndpointListParams,
  buildTokenUsageListParams,
  mapEndpointList,
  mapTokenUsageList,
} from './tenant-api.mappers';

describe('buildTokenUsageListParams', () => {
  it('maps 1-based page to 0-based and default sort', () => {
    const params = buildTokenUsageListParams({
      from: '2025-05-01T00:00:00Z',
      to: '2025-05-28T10:00:00Z',
      userId: '',
      page: 2,
      size: 5,
      sortField: null,
      sortOrder: null,
    });
    expect(params['page']).toBe(1);
    expect(params['size']).toBe(5);
    expect(params['orderBy']).toBe('createdAt');
    expect(params['reverse']).toBe(true);
    expect(params['userId']).toBeUndefined();
  });

  it('maps UI sort fields to API orderBy and reverse asc', () => {
    const params = buildTokenUsageListParams({
      from: '2025-05-01T00:00:00Z',
      to: '2025-05-28T10:00:00Z',
      userId: 'user-1',
      page: 1,
      size: 10,
      sortField: 'amount',
      sortOrder: 'asc',
    });
    expect(params['orderBy']).toBe('totalTokens');
    expect(params['reverse']).toBe(false);
    expect(params['userId']).toBe('user-1');
  });
});

describe('buildEndpointListParams', () => {
  it('maps UI page and sort to API params', () => {
    const params = buildEndpointListParams({
      page: 2,
      size: 5,
      sortField: 'name',
      sortOrder: 'asc',
    });
    expect(params['page']).toBe(1);
    expect(params['size']).toBe(5);
    expect(params['orderBy']).toBe('endpointName');
    expect(params['reverse']).toBe(false);
  });
});

describe('mapTokenUsageList', () => {
  it('maps user_id snake_case to userId', () => {
    const result = mapTokenUsageList({
      contents: [
        {
          id: 'usage-1',
          user_id: 'user-uuid',
          totalCredits: 100,
          createdAt: '2026-05-20T12:00:00Z',
        },
      ],
      totalCount: 1,
      hasNext: false,
    });
    expect(result.contents[0].userId).toBe('user-uuid');
  });
});

describe('mapEndpointList', () => {
  it('maps contents/totalCount response', () => {
    const result = mapEndpointList(
      {
        contents: [
          {
            id: '1',
            tenantId: 't1',
            endpointName: 'Chat',
            type: 'AZURE_OPENAI_CHAT',
            endpoint: 'https://example.com',
            apiKey: 'key',
          },
        ],
        totalCount: 1,
        hasNext: false,
      },
      1,
      5,
    );
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });
});
