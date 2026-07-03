import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AdminUser, UserApiRole, UserRoleUi } from '@app-types/admin/user.types';
import { SelectOption } from '@app-types/common';
import { ToastService } from '@core/services/toast.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent,
  DialogComponent,
  PaginationComponent,
  SelectComponent,
  TableListComponent,
  TableListItemComponent,
} from '@shared/components';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import { UserAddDialogComponent } from './components/user-add-dialog.component';
import { UserEditDialogComponent } from './components/user-edit-dialog.component';
import { UserPasswordRevealDialogComponent } from './components/user-password-reveal-dialog.component';
import { UserListApiService, UpdateUserPayload } from './services/user-list-api.service';
import { UserListAuthService } from './services/user-list-auth.service';
import { UserListStore } from './stores/user-list.store';
import { UserListMenuComponent } from './user-list-menu.component';

@Component({
  selector: 'app-admin-user-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonComponent,
    PaginationComponent,
    SelectComponent,
    UserListMenuComponent,
    MatIconModule,
    SearchInputComponent,
    FormSortInputComponent,
    SvgIconComponent,
    AdminPageShellComponent,
    TableListComponent,
    TableListItemComponent,
    UserAddDialogComponent,
    UserEditDialogComponent,
    UserPasswordRevealDialogComponent,
  ],
  templateUrl: './user-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class AdminUserListComponent implements OnInit {
  readonly store = inject(UserListStore);
  private readonly userListAuth = inject(UserListAuthService);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly userApi = inject(UserListApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  @ViewChild('addUserContent') addUserContent!: TemplateRef<unknown>;
  @ViewChild('editUserContent') editUserContent!: TemplateRef<unknown>;
  @ViewChild('passwordRevealContent') passwordRevealContent!: TemplateRef<unknown>;

  readonly openMenuId = signal<string | null>(null);
  readonly passwordRevealData = signal<{
    initialPassword: string;
    passwordExpiredAt: string;
  } | null>(null);

  readonly addForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    userId: ['', [Validators.required, Validators.maxLength(100)]],
    loginKey: ['', [Validators.maxLength(100)]],
    role: ['user' as UserRoleUi, [Validators.required]],
  });

  readonly editForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    userId: [{ value: '', disabled: true }],
    loginKey: ['', [Validators.maxLength(100)]],
    role: ['user' as UserRoleUi, [Validators.required]],
    resetPassword: [false],
  });

  readonly isAddSubmitting = signal(false);
  readonly isEditSubmitting = signal(false);
  /** `UserController` path variable = `users.login_id` (same as `RanabaseUser.userId`). */
  private editingLoginId: string | null = null;
  /** True when the row being edited has API role SYSTEM (no longer shown in the role radios). */
  private editingWasSystemRole = false;

  readonly sortOptions: SortOption[] = [
    { label: this.translate.instant('ADMIN.USER_MANAGEMENT.SORT_UPDATED_AT'), value: 'updatedAt' },
    { label: this.translate.instant('ADMIN.USER_MANAGEMENT.SORT_USER_NAME'), value: 'name' },
    { label: this.translate.instant('ADMIN.USER_MANAGEMENT.SORT_ROLE'), value: 'role' },
    {
      label: this.translate.instant('ADMIN.USER_MANAGEMENT.SORT_USED_CREDITS'),
      value: 'totalCredits',
    },
  ];

  readonly tagFilterOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.translate.instant('ADMIN.USER_MANAGEMENT.ALL_ROLES') },
    { value: 'admin', label: this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_ADMIN') },
    { value: 'user', label: this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_GENERAL') },
  ]);

  ngOnInit(): void {
    void this.initializeList();
  }

  private async initializeList(): Promise<void> {
    await this.userListAuth.ensureReady();
    await this.store.loadItems();
  }

  @HostListener('document:click')
  closeMenu() {
    if (this.openMenuId()) this.openMenuId.set(null);
  }

  toggleMenu(id: string) {
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  onFilterChange(role: string): void {
    const nextRole = role === 'admin' || role === 'user' ? (role as UserRoleUi) : undefined;
    this.store.updateFilter({ role: nextRole });
  }

  onSearchChange(query: string) {
    this.store.updateFilter({ query });
  }

  onSortChange(field: string | null, order: string | null) {
    this.store.updateFilter({
      sortField: field as any,
      sortOrder: order as any,
    });
  }

  // ─── Add User ────────────────────────────────────────────────
  onAddUser(): void {
    this.addForm.reset({
      displayName: '',
      userId: '',
      loginKey: '',
      role: 'user',
    });
    this.isAddSubmitting.set(false);

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.USER_MANAGEMENT.CREATE_NEW_USER'),
        content: this.addUserContent,
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmMinWidth: 'min-w-24.5',
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitAddUser(ref);
    };
  }

  private async submitAddUser(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddSubmitting()) return;
    this.addForm.markAllAsTouched();
    this.addForm.updateValueAndValidity();
    if (this.addForm.invalid) {
      this.focusFirstInvalidControl();
      return;
    }

    const value = this.addForm.getRawValue();
    const addLoginKey = value.loginKey.trim();

    this.isAddSubmitting.set(true);
    try {
      const res = await this.userApi.create({
        loginId: value.userId.trim(),
        name: value.displayName.trim(),
        role: value.role.toUpperCase() as UserApiRole,
        ...(addLoginKey ? { loginKey: addLoginKey } : {}),
      });
      await this.store.resetFilterAndLoad();
      this.toast.success(this.translate.instant('ADMIN.USER_MANAGEMENT.CREATE_SUCCESS'));
      ref.close(true);
      this.openPasswordRevealDialog(res.initialPassword, res.passwordExpiredAt);
    } catch {
      this.toast.error(this.translate.instant('ADMIN.USER_MANAGEMENT.CREATE_FAILED'));
    } finally {
      this.isAddSubmitting.set(false);
    }
  }

  // ─── Edit User ───────────────────────────────────────────────
  onEditUser(user: AdminUser): void {
    this.editingLoginId = user.userId;
    this.editingWasSystemRole = user.role === 'system';
    this.editForm.reset({
      displayName: user.displayName,
      userId: user.userId,
      loginKey: user.loginKey ?? '',
      role: user.role === 'system' ? 'user' : user.role,
      resetPassword: false,
    });
    this.isEditSubmitting.set(false);

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.USER_MANAGEMENT.EDIT_USER_SETTINGS'),
        content: this.editUserContent,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmMinWidth: 'min-w-24.5',
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitEditUser(ref);
    };
  }

  private async submitEditUser(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isEditSubmitting() || !this.editingLoginId) return;
    this.editForm.markAllAsTouched();
    this.editForm.updateValueAndValidity();
    if (this.editForm.invalid) {
      this.focusFirstInvalidControl();
      return;
    }

    const value = this.editForm.getRawValue();
    const editLoginKey = value.loginKey.trim();

    const payload: UpdateUserPayload = {
      name: value.displayName.trim(),
      resetPassword: value.resetPassword || undefined,
      ...(editLoginKey ? { loginKey: editLoginKey } : {}),
    };
    if (!this.editingWasSystemRole) {
      payload.role = value.role.toUpperCase() as UserApiRole;
    } else if (value.role === 'admin') {
      payload.role = 'ADMIN';
    }

    this.isEditSubmitting.set(true);
    try {
      const res = await this.userApi.update(this.editingLoginId, payload);
      await this.store.loadItems();
      this.toast.success(this.translate.instant('ADMIN.USER_MANAGEMENT.UPDATE_SUCCESS'));
      ref.close(true);
      if (res.initialPassword && res.passwordExpiredAt) {
        this.openPasswordRevealDialog(res.initialPassword, res.passwordExpiredAt);
      }
    } catch {
      this.toast.error(this.translate.instant('ADMIN.USER_MANAGEMENT.UPDATE_FAILED'));
    } finally {
      this.isEditSubmitting.set(false);
    }
  }

  private openPasswordRevealDialog(initialPassword: string, passwordExpiredAt: string): void {
    this.passwordRevealData.set({ initialPassword, passwordExpiredAt });
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_TITLE'),
        content: this.passwordRevealContent,
        showConfirm: false,
        showCancel: true,
        cancelText: this.translate.instant('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_CLOSE'),
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '560px',
      disableClose: true,
    });
  }

  // ─── Delete User ─────────────────────────────────────────────
  onDeleteUser(user?: AdminUser): void {
    const selected = this.store.selectedIds();
    const loginIds = user
      ? [user.userId]
      : this.store
          .items()
          .filter((u) => selected.has(u.id))
          .map((u) => u.userId);
    if (loginIds.length === 0) return;

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.USER_MANAGEMENT.DELETE_TITLE'),
        message: this.translate.instant('ADMIN.USER_MANAGEMENT.DELETE_MESSAGE'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmIcon: 'delete',
        confirmMinWidth: 'min-w-30.5',
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        buttonAlign: 'center',
        showDivider: true,
        class: 'm-w-[calc(100vw-32px)]',
      },
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitDeleteUsers(ref, loginIds);
    };
  }

  private async submitDeleteUsers(
    ref: MatDialogRef<DialogComponent>,
    loginIds: string[],
  ): Promise<void> {
    try {
      await Promise.all(loginIds.map((loginId) => this.userApi.deleteOne(loginId)));
      await this.store.loadItems();
      this.toast.success(this.translate.instant('ADMIN.USER_MANAGEMENT.DELETE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('ADMIN.USER_MANAGEMENT.DELETE_FAILED'));
    }
  }

  formatCredits(credits: number): string {
    return credits.toLocaleString();
  }

  getRoleDisplay(role: string): string {
    const r = String(role).toLowerCase();
    if (r === 'admin') {
      return this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_ADMIN');
    }
    // API の SYSTEM も一覧では「一般」と同じ表記にする（システム専用ラベルは出さない）
    return this.translate.instant('ADMIN.USER_MANAGEMENT.ROLE_GENERAL');
  }

  private focusFirstInvalidControl(): void {
    setTimeout(() => {
      const invalidControl = document.querySelector('.ng-invalid[formControlName]');
      if (invalidControl) {
        invalidControl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = invalidControl.querySelector('input, select, textarea') as HTMLElement;
        if (input) {
          input.focus();
        } else {
          (invalidControl as HTMLElement).focus();
        }
      }
    }, 100);
  }
}
