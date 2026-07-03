import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupApiService } from './group-api.service';
import { GroupUsersApiService } from './group-users-api.service';
import { GroupAssistantsApiService } from './group-assistants-api.service';
import { GroupTemplatesApiService } from './group-templates-api.service';
import { ApiClientService } from '../../../../../core/services/api-client';

function buildApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe('GroupApiService', () => {
  let service: GroupApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [GroupApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GroupApiService);
  });

  it('list calls GET /admin/groups with pagination params', async () => {
    api.get.mockResolvedValue({ data: [], total: 0, page: 0, size: 5 });
    await service.list({ pageSize: 5, pageIndex: 1, sortField: 'updatedAt', sortOrder: 'desc' });
    expect(api.get).toHaveBeenCalledWith(
      '/admin/groups',
      expect.objectContaining({ params: expect.objectContaining({ page: 0, size: 5 }) }),
    );
  });

  it('create calls POST /admin/groups with name only', async () => {
    api.post.mockResolvedValue({ id: '1', name: 'New Team' });
    await service.create({ name: 'New Team' });
    expect(api.post).toHaveBeenCalledWith(
      '/admin/groups',
      { name: 'New Team' },
      {
        skipGlobalErrorToast: true,
      },
    );
  });

  it('update calls PATCH /admin/groups/:id with name only', async () => {
    api.patch.mockResolvedValue({ id: '5', name: 'Updated' });
    await service.update('5', { name: 'Updated' });
    expect(api.patch).toHaveBeenCalledWith(
      '/admin/groups/5',
      { name: 'Updated' },
      {
        skipGlobalErrorToast: true,
      },
    );
  });

  it('getById calls GET /admin/groups/:id and maps basic detail fields', async () => {
    api.get.mockResolvedValue({
      id: '3',
      name: 'Team C',
      tenantId: 'tenant-1',
      updatedAt: '2026-01-01',
    });
    const result = await service.getById('3');
    expect(api.get).toHaveBeenCalledWith('/admin/groups/3');
    expect(result.name).toBe('Team C');
    expect(result.tenantId).toBe('tenant-1');
  });
});

describe('GroupUsersApiService', () => {
  let service: GroupUsersApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [GroupUsersApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GroupUsersApiService);
  });

  it('listByGroup calls GET on the group users tab endpoint', async () => {
    api.get.mockResolvedValue({ content: [], totalElements: 0, number: 0, size: 25 });
    await service.listByGroup('g1', {
      pageSize: 25,
      pageIndex: 1,
      sortField: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/admin/groups/g1/users',
      expect.objectContaining({
        params: expect.objectContaining({ page: 0, size: 25, includeUsage: true }),
      }),
    );
  });

  it('addUsers calls POST on the group users endpoint', async () => {
    api.post.mockResolvedValue(undefined);
    await service.addUsers('g1', ['u1', 'u2']);
    expect(api.post).toHaveBeenCalledWith(
      '/admin/groups/g1/users',
      { userIds: ['u1', 'u2'] },
      {
        skipGlobalErrorToast: true,
      },
    );
  });

  it('remove calls DELETE on the group user detail endpoint', async () => {
    api.delete.mockResolvedValue(undefined);
    await service.remove('g1', 'u1');
    expect(api.delete).toHaveBeenCalledWith('/admin/groups/g1/users/u1', {
      skipGlobalErrorToast: true,
    });
  });

  it('updateRole calls PATCH on the group user detail endpoint', async () => {
    api.patch.mockResolvedValue(undefined);
    await service.updateRole('g1', 'u1', true);
    expect(api.patch).toHaveBeenCalledWith(
      '/admin/groups/g1/users/u1',
      { groupAdmin: true },
      { skipGlobalErrorToast: true },
    );
  });

  it('list passes excludeGroupId for add-user picker', async () => {
    api.get.mockResolvedValue({ content: [], totalElements: 0, number: 0, size: 25 });
    await service.list({
      pageSize: 25,
      pageIndex: 1,
      excludeGroupId: 'g1',
    });
    expect(api.get.mock.calls[0][1].params.excludeGroupId).toBe('g1');
  });
});

describe('GroupAssistantsApiService', () => {
  let service: GroupAssistantsApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [GroupAssistantsApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GroupAssistantsApiService);
  });

  it('listByGroup calls GET on the group assistants tab endpoint', async () => {
    api.get.mockResolvedValue({ content: [], totalElements: 0, number: 0, size: 25 });
    await service.listByGroup('g1', {
      pageSize: 25,
      pageIndex: 1,
      sortField: 'addedAt',
      sortOrder: 'desc',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/admin/groups/g1/assistants',
      expect.objectContaining({ params: expect.objectContaining({ page: 0, size: 25 }) }),
    );
  });

  it('listByGroup passes categoryId query param', async () => {
    api.get.mockResolvedValue({ content: [], totalElements: 0, number: 0, size: 25 });
    await service.listByGroup('g1', {
      pageSize: 25,
      pageIndex: 1,
      categoryId: 'cat-1',
    });
    expect(api.get.mock.calls[0][1].params.categoryId).toBe('cat-1');
  });

  it('addAssistants calls POST on the group assistants endpoint', async () => {
    api.post.mockResolvedValue(undefined);
    await service.addAssistants('g1', ['a1']);
    expect(api.post).toHaveBeenCalledWith(
      '/admin/groups/g1/assistants',
      { assistantIds: ['a1'] },
      { skipGlobalErrorToast: true },
    );
  });

  it('remove calls DELETE on the group assistant detail endpoint', async () => {
    api.delete.mockResolvedValue(undefined);
    await service.remove('g1', 'a1');
    expect(api.delete).toHaveBeenCalledWith('/admin/groups/g1/assistants/a1', {
      skipGlobalErrorToast: true,
    });
  });
});

describe('GroupTemplatesApiService', () => {
  let service: GroupTemplatesApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [GroupTemplatesApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(GroupTemplatesApiService);
  });

  it('listByGroup calls GET on the group templates tab endpoint', async () => {
    api.get.mockResolvedValue({ content: [], totalElements: 0, number: 0, size: 25 });
    await service.listByGroup('g2', {
      pageSize: 25,
      pageIndex: 1,
      sortField: 'addedAt',
      sortOrder: 'desc',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/admin/groups/g2/prompt-templates',
      expect.objectContaining({ params: expect.objectContaining({ page: 0, size: 25 }) }),
    );
  });

  it('addTemplates calls POST on the group templates endpoint', async () => {
    api.post.mockResolvedValue(undefined);
    await service.addTemplates('g2', ['t1']);
    expect(api.post).toHaveBeenCalledWith(
      '/admin/groups/g2/prompt-templates',
      { templateIds: ['t1'] },
      { skipGlobalErrorToast: true },
    );
  });

  it('remove calls DELETE on the group template detail endpoint', async () => {
    api.delete.mockResolvedValue(undefined);
    await service.remove('g2', 't1');
    expect(api.delete).toHaveBeenCalledWith('/admin/groups/g2/prompt-templates/t1', {
      skipGlobalErrorToast: true,
    });
  });
});
