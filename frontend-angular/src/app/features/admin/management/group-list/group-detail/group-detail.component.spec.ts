import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { GroupDetailComponent } from './group-detail.component';
import { GroupApiService } from '../services/group-api.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { DropdownService } from '../../../../../core/services/dropdown.service';
import { ROUTES } from '../../../../../core/constants/routes.config';

import { AuthStore } from '@core/stores/auth.store';

const mockAuthStore = {
  isGroupAdminOnly: vi.fn(() => false),
};

function buildDialogRefSpy() {
  const ref = {
    close: vi.fn(),
    componentInstance: {
      data: {} as { confirmAction?: () => unknown } & Record<string, unknown>,
    },
  };
  return ref as unknown as MatDialogRef<unknown> & {
    componentInstance: { data: { confirmAction?: () => unknown } & Record<string, unknown> };
  };
}

function buildProviders(groupId = 'grp-1') {
  const groupApi = {
    getById: vi.fn().mockResolvedValue({
      id: groupId,
      name: 'Team Alpha',
      tenantId: 'tenant-1',
      updatedAt: '2026-01-01',
    }),
    update: vi.fn().mockResolvedValue({
      id: groupId,
      name: 'Updated Name',
      tenantId: 'tenant-1',
      updatedAt: '2026-01-02',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dropdown = { open: vi.fn(), notifyClosed: vi.fn() };
  const dialogRef = buildDialogRefSpy();
  const dialog = { open: vi.fn().mockReturnValue(dialogRef) };

  const activatedRoute = {
    paramMap: of(convertToParamMap({ id: groupId })),
    snapshot: { paramMap: convertToParamMap({ id: groupId }) },
  };

  return {
    providers: [
      GroupDetailComponent,
      TranslateModule.forRoot().providers ?? [],
      provideRouter([{ path: '**', component: GroupDetailComponent }]),
      { provide: ActivatedRoute, useValue: activatedRoute },
      { provide: GroupApiService, useValue: groupApi },
      { provide: ToastService, useValue: toast },
      { provide: DropdownService, useValue: dropdown },
      { provide: MatDialog, useValue: dialog },
      { provide: AuthStore, useValue: mockAuthStore },
    ],
    spies: {
      groupApi,
      toast,
      dropdown,
      dialog,
      dialogRef,
    },
  };
}

describe('GroupDetailComponent', () => {
  let component: GroupDetailComponent;
  let router: Router;
  let spies: ReturnType<typeof buildProviders>['spies'];

  beforeEach(async () => {
    const { providers, spies: s } = buildProviders('42');
    spies = s;
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers });
    await TestBed.compileComponents();
    component = TestBed.inject(GroupDetailComponent);
    router = TestBed.inject(Router);
  });

  describe('goBack', () => {
    it('navigates to the ADMIN_GROUPS path', async () => {
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.goBack();
      expect(spy).toHaveBeenCalledWith([ROUTES.APP.ADMIN_GROUPS]);
    });
  });

  describe('toggleMenu', () => {
    it('opens menu and registers with DropdownService', () => {
      component.toggleMenu();
      expect(component.isMenuOpen()).toBe(true);
      expect(spies.dropdown.open).toHaveBeenCalledTimes(1);
    });
  });

  describe('openEditDialog', () => {
    it('closes menu and opens dialog', async () => {
      component.toggleMenu();
      await component.openEditDialog();

      expect(component.isMenuOpen()).toBe(false);
      expect(spies.dropdown.notifyClosed).toHaveBeenCalled();
      expect(spies.dialog.open).toHaveBeenCalled();
    });

    it('pre-populates editForm.name with groupName', async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await component.openEditDialog();
      expect(component.editForm.getRawValue().name).toBe('Team Alpha');
    });

    it('is a no-op when groupId is empty', async () => {
      const { providers } = buildProviders('');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers });
      const comp = TestBed.inject(GroupDetailComponent);
      await comp.openEditDialog();
      expect(spies.dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('edit form submission', () => {
    it('updates groupName with name-only payload and shows success toast', async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await component.openEditDialog();
      component.editForm.setValue({ name: 'Renamed Team' });

      const confirmAction = spies.dialogRef.componentInstance.data
        .confirmAction as () => Promise<void>;
      await confirmAction();

      expect(spies.groupApi.update).toHaveBeenCalledWith('42', { name: 'Renamed Team' });
      expect(component.groupName()).toBe('Updated Name');
      expect(spies.toast.success).toHaveBeenCalled();
      expect(spies.dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('does not submit when form is invalid', async () => {
      await component.openEditDialog();
      component.editForm.reset();
      const confirmAction = spies.dialogRef.componentInstance.data
        .confirmAction as () => Promise<void>;
      await confirmAction();
      expect(spies.groupApi.update).not.toHaveBeenCalled();
    });

    it('shows error toast when API throws', async () => {
      spies.groupApi.update.mockRejectedValue(new Error('server error'));
      await component.openEditDialog();
      component.editForm.setValue({ name: 'Fails' });
      const confirmAction = spies.dialogRef.componentInstance.data
        .confirmAction as () => Promise<void>;
      await confirmAction();
      expect(spies.toast.error).toHaveBeenCalled();
      expect(component.isEditSubmitting()).toBe(false);
    });
  });

  describe('delete group', () => {
    it('calls delete, shows success toast and navigates back to list', async () => {
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.openDeleteDialog();

      const confirmAction = spies.dialogRef.componentInstance.data
        .confirmAction as () => Promise<void>;
      await confirmAction();

      expect(spies.groupApi.delete).toHaveBeenCalledWith('42');
      expect(spies.toast.success).toHaveBeenCalled();
      expect(spies.dialogRef.close).toHaveBeenCalledWith(true);
      expect(navSpy).toHaveBeenCalledWith([ROUTES.APP.ADMIN_GROUPS]);
    });
  });

  describe('tabs', () => {
    it('generates 3 tabs with correct ids when groupId is set', () => {
      const tabs = component.tabs();
      expect(tabs).toHaveLength(3);
      expect(tabs.map((t) => t.id)).toEqual(['users', 'assistants', 'templates']);
    });
  });
});
