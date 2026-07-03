import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GroupUsersStore } from './group-users.store';
import { GroupUsersApiService } from '../services/group-users-api.service';
import type { UserApiItem } from '../../../../../../types/admin/user.types';
import type { PagedResponse } from '../../../../../../types/api-response.type';

const makeUserItem = (overrides: Partial<UserApiItem> = {}): UserApiItem => ({
  id: '1',
  userId: 'user-1',
  displayName: 'Alice',
  role: 'user',
  groupAdmin: false,
  usedTokens: null,
  loginKey: '',
  accountType: 'none',
  email: '',
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeResponse = (items: UserApiItem[], total = items.length): PagedResponse<UserApiItem> => ({
  content: items,
  totalElements: total,
  number: 0,
  size: 25,
});

describe('GroupUsersStore', () => {
  let store: InstanceType<typeof GroupUsersStore>;
  let apiSpy: {
    listByGroup: ReturnType<typeof vi.fn>;
    addUsers: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      listByGroup: vi.fn(),
      addUsers: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      updateRole: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [GroupUsersStore, { provide: GroupUsersApiService, useValue: apiSpy }],
    });
    store = TestBed.inject(GroupUsersStore);
  });

  it('loads group members from tab API', async () => {
    store.setGroup('grp-1');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([makeUserItem()], 1));
    await store.loadItems();
    expect(store.items()).toHaveLength(1);
    expect(store.totalItems()).toBe(1);
  });

  it('addUsers calls child-resource POST API', async () => {
    store.setGroup('grp-1');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.addUsers(['u2']);
    expect(apiSpy.addUsers).toHaveBeenCalledWith('grp-1', ['u2']);
  });

  it('removeUsers calls child-resource DELETE API', async () => {
    store.setGroup('grp-1');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.removeUsers(['u1']);
    expect(apiSpy.remove).toHaveBeenCalledWith('grp-1', 'u1');
  });

  it('updateUserRole calls child-resource PATCH API', async () => {
    store.setGroup('grp-1');
    apiSpy.listByGroup.mockResolvedValue(makeResponse([]));
    await store.updateUserRole('u1', 'admin');
    expect(apiSpy.updateRole).toHaveBeenCalledWith('grp-1', 'u1', true);
  });
});
