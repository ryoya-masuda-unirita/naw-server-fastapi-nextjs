import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupsApiService } from './groups-api.service';
import { ApiClientService } from '@core/services/api-client';

function buildApiClient() {
  return { get: vi.fn() };
}

describe('GroupsApiService', () => {
  let service: GroupsApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [GroupsApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GroupsApiService);
  });

  it('チーム一覧を取得できること', async () => {
    const groups = [
      { id: 'g1', name: 'Sales' },
      { id: 'g2', name: 'Marketing' },
    ];
    api.get.mockResolvedValue({
      data: groups,
      total: groups.length,
      page: 0,
      pageSize: 1000,
      totalPages: 1,
    });

    const result = await service.list();

    expect(result).toEqual(groups);
  });

  it('データが空のときは空配列を返すこと', async () => {
    api.get.mockResolvedValue({ data: [], total: 0, page: 0, pageSize: 1000, totalPages: 0 });

    const result = await service.list();

    expect(result).toEqual([]);
  });
});
