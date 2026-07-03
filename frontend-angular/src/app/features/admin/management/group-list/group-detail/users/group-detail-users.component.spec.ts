import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { GroupDetailUsersComponent } from './group-detail-users.component';
import { GroupUsersStore } from '../../stores/group-users.store';
import { GroupUsersApiService } from '../../services/group-users-api.service';
import { ToastService } from '../../../../../../core/services/toast.service';
import { AuthStore } from '../../../../../../core/stores/auth.store';
import type { UserApiItem } from '../../../../../../../types/admin/user.types';

// ─── helpers ────────────────────────────────────────────────────────────────

type DialogRefSpy = MatDialogRef<unknown> & {
  componentInstance: { data: { confirmAction?: () => unknown } & Record<string, unknown> };
  close: ReturnType<typeof vi.fn>;
};

function buildDialogRef(): DialogRefSpy {
  return {
    close: vi.fn(),
    componentInstance: { data: {} as { confirmAction?: () => unknown } & Record<string, unknown> },
  } as unknown as DialogRefSpy;
}

function makeUser(overrides: Partial<UserApiItem> = {}): UserApiItem {
  return {
    id: 'u1',
    userId: 'u1',
    displayName: 'Alice',
    role: 'user',
    groupAdmin: false,
    usedTokens: 0,
    loginKey: '',
    accountType: 'none',
    email: '',
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function buildSetup(groupId = 'g1', currentUser: { id: string; name: string } | null = null) {
  const storeSpy = {
    setGroup: vi.fn(),
    updateFilter: vi.fn(),
    updatePageIndex: vi.fn(),
    toggleSelectAll: vi.fn(),
    toggleSelected: vi.fn(),
    clearSelection: vi.fn(),
    addUsers: vi.fn().mockResolvedValue(undefined),
    updateUserRole: vi.fn().mockResolvedValue(undefined),
    removeUsers: vi.fn().mockResolvedValue(undefined),
    selectedIds: vi.fn().mockReturnValue(new Set<string>()),
    pageRange: vi.fn().mockReturnValue({ from: 0, to: 0, total: 0 }),
    groupId: vi.fn().mockReturnValue(groupId),
    filter: vi.fn().mockReturnValue({ pageIndex: 1, pageSize: 25 }),
    items: vi.fn().mockReturnValue([] as UserApiItem[]),
  };
  const relatedApi = {
    list: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'u2',
          userId: 'u2',
          displayName: 'Bob',
          role: 'user',
          usedTokens: null,
          loginKey: '',
          accountType: 'none',
          email: '',
          updatedAt: new Date(),
        },
      ],
      total: 1,
      page: 0,
      size: 25,
    }),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dialogRef = buildDialogRef();
  const dialog = { open: vi.fn().mockReturnValue(dialogRef) };

  const parentParamMap = convertToParamMap({ id: groupId });
  const activatedRoute = {
    parent: { paramMap: of(parentParamMap) },
    snapshot: { parent: { paramMap: parentParamMap } },
    paramMap: of(convertToParamMap({})),
  };

  const authStore = {
    user: vi.fn().mockReturnValue(currentUser ? { ...currentUser, groups: [] } : null),
  };

  return {
    storeSpy,
    relatedApi,
    toast,
    dialog,
    dialogRef,
    authStore,
    providers: [
      GroupDetailUsersComponent,
      { provide: GroupUsersStore, useValue: storeSpy },
      { provide: GroupUsersApiService, useValue: relatedApi },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: ActivatedRoute, useValue: activatedRoute },
      { provide: AuthStore, useValue: authStore },
    ],
  };
}

// ─── GroupDetailUsersComponent ───────────────────────────────────────────────

describe('GroupDetailUsersComponent', () => {
  let component: GroupDetailUsersComponent;
  let storeSpy: ReturnType<typeof buildSetup>['storeSpy'];
  let relatedApi: ReturnType<typeof buildSetup>['relatedApi'];
  let toast: ReturnType<typeof buildSetup>['toast'];
  let dialog: ReturnType<typeof buildSetup>['dialog'];
  let dialogRef: ReturnType<typeof buildSetup>['dialogRef'];

  beforeEach(async () => {
    const setup = buildSetup('grp-42');
    ({ storeSpy, relatedApi, toast, dialog, dialogRef } = setup);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: setup.providers,
    });
    await TestBed.compileComponents();
    component = TestBed.inject(GroupDetailUsersComponent);
    // flush the constructor effect which reads the route param signal
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // ── effect: setGroup ──────────────────────────────────────────────────────

  it('calls store.setGroup with the parent route id on init', () => {
    expect(storeSpy.setGroup).toHaveBeenCalledWith('grp-42');
  });

  // ── toggleMenu ────────────────────────────────────────────────────────────

  describe('toggleMenu', () => {
    it('opens the menu for a given user id', () => {
      component.toggleMenu('u1');
      expect(component.openMenuId()).toBe('u1');
    });

    it('closes the menu when the same id is toggled again', () => {
      component.toggleMenu('u1');
      component.toggleMenu('u1');
      expect(component.openMenuId()).toBeNull();
    });

    it('switches to a different id', () => {
      component.toggleMenu('u1');
      component.toggleMenu('u2');
      expect(component.openMenuId()).toBe('u2');
    });
  });

  // ── closeMenu (HostListener) ──────────────────────────────────────────────

  it('closeMenu resets openMenuId to null', () => {
    component.toggleMenu('u1');
    component.closeMenu();
    expect(component.openMenuId()).toBeNull();
  });

  // ── onFilterChange ────────────────────────────────────────────────────────

  describe('onFilterChange', () => {
    it('passes filter fields to store.updateFilter', () => {
      component.onFilterChange({
        query: 'bob',
        role: 'admin',
        sortField: 'name',
        sortOrder: 'asc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bob',
          role: 'ADMIN',
          sortField: 'name',
          sortOrder: 'asc',
        }),
      );
    });

    it('converts empty query string to undefined', () => {
      component.onFilterChange({
        query: '',
        role: 'all',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ query: undefined }),
      );
    });

    it('converts "all" role to undefined', () => {
      component.onFilterChange({
        query: '',
        role: 'all',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ query: undefined, role: undefined }),
      );
    });
  });

  // ── onSelectAll / onItemSelect / clearSelection ───────────────────────────

  it('onSelectAll delegates to store.toggleSelectAll', () => {
    component.onSelectAll(true);
    expect(storeSpy.toggleSelectAll).toHaveBeenCalledWith(true);
    component.onSelectAll(false);
    expect(storeSpy.toggleSelectAll).toHaveBeenCalledWith(false);
  });

  it('onItemSelect delegates to store.toggleSelected', () => {
    component.onItemSelect({ id: 'u5', checked: true });
    expect(storeSpy.toggleSelected).toHaveBeenCalledWith('u5', true);
  });

  it('clearSelection delegates to store.clearSelection', () => {
    component.clearSelection();
    expect(storeSpy.clearSelection).toHaveBeenCalled();
  });

  // ── changeRole ────────────────────────────────────────────────────────────

  it('changeRole updates editRoleValue signal', () => {
    component.changeRole('admin');
    expect(component.editRoleValue()).toBe('admin');
    component.changeRole('user');
    expect(component.editRoleValue()).toBe('user');
  });

  // ── onAddUser ─────────────────────────────────────────────────────────────

  describe('onAddUser', () => {
    it('loads user options and opens dialog', async () => {
      await component.onAddUser();
      expect(relatedApi.list).toHaveBeenCalled();
      expect(component.userOptions).toHaveLength(1);
      expect(dialog.open).toHaveBeenCalled();
    });

    it('reloads user options on each open for server-side search', async () => {
      component.userOptions = [{ value: 'u2', label: 'Bob' }];
      await component.onAddUser();
      expect(relatedApi.list).toHaveBeenCalled();
    });

    it('resets selection to empty before opening', async () => {
      component.addUserSelection.set(['u1', 'u2']);
      await component.onAddUser();
      expect(component.addUserSelection()).toEqual([]);
    });

    it('on confirm: calls store.addUsers and shows success toast', async () => {
      await component.onAddUser();
      component.addUserSelection.set(['u2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addUsers).toHaveBeenCalledWith(['u2']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: skips submit when selection is empty', async () => {
      await component.onAddUser();
      component.addUserSelection.set([]);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addUsers).not.toHaveBeenCalled();
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.addUsers.mockRejectedValue(new Error('fail'));
      await component.onAddUser();
      component.addUserSelection.set(['u2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ── onEditRole ────────────────────────────────────────────────────────────

  describe('onEditRole', () => {
    it('sets editRoleValue from groupAdmin and opens dialog', () => {
      component.onEditRole(makeUser({ id: 'u1', groupAdmin: true }));
      expect(component.editRoleValue()).toBe('admin');
      expect(dialog.open).toHaveBeenCalled();
    });

    it('on confirm: calls store.updateUserRole with current role value', async () => {
      component.onEditRole(makeUser({ id: 'u1', role: 'user' as const }));
      component.changeRole('admin');
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.updateUserRole).toHaveBeenCalledWith('u1', 'admin');
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.updateUserRole.mockRejectedValue(new Error('fail'));
      component.onEditRole(makeUser({ id: 'u1', role: 'user' as const }));
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });

    it('does not open dialog for the current user row', () => {
      storeSpy.items.mockReturnValue([
        makeUser({
          id: 'internal-id',
          userId: 'internal-id',
          name: 'self-user',
          displayName: 'self-user',
        }),
      ]);
      const selfSetup = buildSetup('grp-42', { id: 'login-id', name: 'self-user' });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot()],
        providers: selfSetup.providers,
      });
      const selfComponent = TestBed.inject(GroupDetailUsersComponent);
      selfComponent.onEditRole(
        makeUser({
          id: 'internal-id',
          userId: 'internal-id',
          name: 'self-user',
          displayName: 'self-user',
        }),
      );
      expect(selfSetup.dialog.open).not.toHaveBeenCalled();
    });
  });

  // ── onRemoveUser ──────────────────────────────────────────────────────────

  describe('onRemoveUser', () => {
    it('opens dialog for a specific user', () => {
      component.onRemoveUser(makeUser({ id: 'u3' }));
      expect(dialog.open).toHaveBeenCalled();
    });

    it('opens dialog using selected ids when no user is passed', () => {
      storeSpy.selectedIds.mockReturnValue(new Set(['u1', 'u2']));
      component.onRemoveUser();
      expect(dialog.open).toHaveBeenCalled();
    });

    it('does nothing when no user and selection is empty', () => {
      storeSpy.selectedIds.mockReturnValue(new Set<string>());
      component.onRemoveUser();
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('does not open dialog when removing the current user', () => {
      storeSpy.items.mockReturnValue([
        makeUser({
          id: 'internal-id',
          userId: 'internal-id',
          name: 'self-user',
          displayName: 'self-user',
        }),
      ]);
      const selfSetup = buildSetup('grp-42', { id: 'login-id', name: 'self-user' });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot()],
        providers: selfSetup.providers,
      });
      const selfComponent = TestBed.inject(GroupDetailUsersComponent);
      selfComponent.onRemoveUser(
        makeUser({
          id: 'internal-id',
          userId: 'internal-id',
          name: 'self-user',
          displayName: 'self-user',
        }),
      );
      expect(selfSetup.dialog.open).not.toHaveBeenCalled();
    });

    it('on confirm: calls store.removeUsers and shows success toast', async () => {
      component.onRemoveUser(makeUser({ id: 'u3' }));
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.removeUsers).toHaveBeenCalledWith(['u3']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.removeUsers.mockRejectedValue(new Error('gone'));
      component.onRemoveUser(makeUser({ id: 'u3' }));
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });
});

// ─── GroupUsersTableComponent ─────────────────────────────────────────────────

import { GroupUsersTableComponent } from './components/group-users-table/group-users-table.component';

describe('GroupUsersTableComponent', () => {
  let table: GroupUsersTableComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupUsersTableComponent],
      providers: [provideRouter([]), GroupUsersTableComponent],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(GroupUsersTableComponent);
    fixture.componentRef.setInput('items', [makeUser()]);
    fixture.componentRef.setInput('selectedIds', new Set(['u1']));
    fixture.detectChanges();
    table = fixture.componentInstance;
  });

  it('isSelected returns true when id is in the set', () => {
    expect(table.isSelected('u1')).toBe(true);
  });

  it('isSelected returns false when id is not in the set', () => {
    expect(table.isSelected('u9')).toBe(false);
  });

  it('roleLabelKey returns GROUPS.ROLE_ADMIN for group admin', () => {
    expect(table.roleLabelKey(makeUser({ groupAdmin: true }))).toBe('GROUPS.ROLE_ADMIN');
  });

  it('roleLabelKey returns GROUPS.ROLE_MEMBER for non-admin member', () => {
    expect(table.roleLabelKey(makeUser({ groupAdmin: false }))).toBe('GROUPS.ROLE_MEMBER');
  });

  it('formatCredits returns a non-empty formatted string', () => {
    expect(table.formatCredits(1234)).toBeTruthy();
    expect(typeof table.formatCredits(0)).toBe('string');
  });

  it('isCurrentUser returns true when row name matches current user name', () => {
    const fixture = TestBed.createComponent(GroupUsersTableComponent);
    fixture.componentRef.setInput('items', [makeUser()]);
    fixture.componentRef.setInput('selectedIds', new Set<string>());
    fixture.componentRef.setInput('currentUser', {
      id: 'login-id',
      name: 'self-user',
      role: 'USER',
      groups: [],
    });
    fixture.detectChanges();
    const tableInstance = fixture.componentInstance;
    expect(
      tableInstance.isCurrentUser(
        makeUser({
          id: 'internal-id',
          userId: 'internal-id',
          name: 'self-user',
          displayName: 'self-user',
        }),
      ),
    ).toBe(true);
  });

  it('isCurrentUser returns false for other users', () => {
    const fixture = TestBed.createComponent(GroupUsersTableComponent);
    fixture.componentRef.setInput('items', [makeUser()]);
    fixture.componentRef.setInput('selectedIds', new Set<string>());
    fixture.componentRef.setInput('currentUser', {
      id: 'login-id',
      name: 'self-user',
      role: 'USER',
      groups: [],
    });
    fixture.detectChanges();
    const tableInstance = fixture.componentInstance;
    expect(tableInstance.isCurrentUser(makeUser({ id: 'u1', userId: 'u1' }))).toBe(false);
  });
});

// ─── GroupUsersFilterComponent ────────────────────────────────────────────────

import { GroupUsersFilterComponent } from './components/group-users-filter/group-users-filter.component';

describe('GroupUsersFilterComponent', () => {
  let filter: GroupUsersFilterComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupUsersFilterComponent],
      providers: [provideRouter([]), GroupUsersFilterComponent],
    });
    await TestBed.compileComponents();
    filter = TestBed.inject(GroupUsersFilterComponent);
  });

  it('emits filterChange with correct query on onSearchChange', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSearchChange('hello');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hello',
        role: 'all',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      }),
    );
  });

  it('onRoleChange updates filterRole and emits', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onRoleChange('admin');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });

  it('onRoleChange defaults to "all" on null', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onRoleChange(null);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ role: 'all' }));
  });

  it('onSortFieldChange updates sortField and emits', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSortFieldChange('name');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sortField: 'name' }));
  });

  it('onSortOrderChange updates sortOrder and emits', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSortOrderChange('asc');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 'asc' }));
  });

  it('onPageChange emits pageIndexChange', () => {
    const spy = vi.spyOn(filter.pageIndexChange, 'emit');
    filter.onPageChange(3);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('roleOptions includes all/admin/user entries', () => {
    const options = filter.roleOptions();
    expect(options.map((o) => o.value)).toEqual(['all', 'admin', 'user']);
  });
});
