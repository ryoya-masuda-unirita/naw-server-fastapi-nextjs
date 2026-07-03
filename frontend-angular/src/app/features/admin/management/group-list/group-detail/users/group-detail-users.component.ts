import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, DialogComponent, PaginationComponent } from '@shared/components';
import { MultiSelectComponent } from '@shared/components/multi-select/multi-select.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { matchesCurrentUser } from '@core/utils/auth.helpers';
import { GroupUserRole } from '@app-types/admin/group-management.types';
import { SelectOption } from '@app-types/common';
import {
  GroupUsersFilterChange,
  GroupUsersFilterComponent,
} from './components/group-users-filter/group-users-filter.component';
import { GroupUsersTableComponent } from './components/group-users-table/group-users-table.component';
import { GroupUsersStore } from '../../stores/group-users.store';
import { FormRadioComponent } from '@app/shared/components/form/form-radio/form-radio.component';
import { GroupUsersApiService } from '../../services/group-users-api.service';
import { ROLES } from '../../group-list.constants';
import { UserApiItem } from '@app-types/admin/user.types';

/**
 * The 所属ユーザー tab on the team detail page.
 *
 * Layout: action bar (.sp-fixed-btn) → filter row → table → bottom pagination.
 */
@Component({
  selector: 'app-group-detail-users',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatProgressSpinnerModule,
    GroupUsersFilterComponent,
    GroupUsersTableComponent,
    PaginationComponent,
    ButtonComponent,
    SvgIconComponent,
    FormRadioComponent,
    MultiSelectComponent,
  ],
  templateUrl: './group-detail-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupDetailUsersComponent {
  readonly store = inject(GroupUsersStore);
  readonly authStore = inject(AuthStore);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly relatedApi = inject(GroupUsersApiService);

  @ViewChild('addUserContent') addUserContent!: TemplateRef<unknown>;
  @ViewChild('editRoleContent') editRoleContent!: TemplateRef<unknown>;
  @ViewChild('removeUserContent') removeUserContent!: TemplateRef<unknown>;

  readonly openMenuId = signal<string | null>(null);
  /** Role selection state for the edit-role dialog. */
  readonly editRoleValue = signal<GroupUserRole>('user');
  readonly editingUserId = signal<string | null>(null);
  /** User ids selected in the add-user dialog. */
  readonly addUserSelection = signal<string[]>([]);
  /** Populated before the add-user dialog opens. Plain property — synchronous, no CD issues. */
  userOptions: SelectOption[] = [];
  private isEditRoleSubmitting = false;
  private isRemoveSubmitting = false;
  private isAddUserSubmitting = false;

  /** Group id from the parent route (`/groups/:id/users`). */
  private readonly groupId = toSignal(
    this.route.parent!.paramMap.pipe(
      takeUntilDestroyed(),
      map((p) => p.get('id') ?? ''),
    ),
    { initialValue: '' },
  );

  readonly countDisplay = computed(() => {
    const r = this.store.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('GROUPS.PAGE_COUNT', {
      from: r.from,
      to: r.to,
      total: r.total,
    });
  });

  readonly currentUser = computed(() => this.authStore.user());

  readonly roleOptions = computed<SelectOption<GroupUserRole>[]>(() => {
    const options: SelectOption<GroupUserRole>[] = [
      { value: 'user', label: this.translate.instant('GROUPS.ROLE_MEMBER') },
      { value: 'admin', label: this.translate.instant('GROUPS.ROLE_ADMIN') },
    ];
    const editingId = this.editingUserId();
    if (editingId && this.isCurrentUserId(editingId)) {
      return options.filter((option) => option.value === 'admin');
    }
    return options;
  });

  constructor() {
    effect(() => {
      const id = this.groupId();
      if (id) this.store.setGroup(id);
    });
  }

  @HostListener('document:click')
  closeMenu() {
    if (this.openMenuId()) this.openMenuId.set(null);
  }

  onFilterChange(event: GroupUsersFilterChange) {
    this.store.updateFilter({
      query: event.query || undefined,
      role: event.role === ROLES.ALL ? undefined : event.role === ROLES.ADMIN ? 'ADMIN' : 'USER',
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  }

  toggleMenu(id: string) {
    if (this.isCurrentUserId(id)) return;
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  isCurrentUser(user: UserApiItem): boolean {
    return matchesCurrentUser(user, this.currentUser());
  }

  private isCurrentUserId(userId: string): boolean {
    const member = this.store.items().find((item) => item.id === userId);
    if (member) {
      return this.isCurrentUser(member);
    }
    const currentUser = this.currentUser();
    if (!currentUser) return false;
    return userId === currentUser.id || userId === currentUser.name;
  }

  private removableUserIds(ids: string[]): string[] {
    return ids.filter((id) => !this.isCurrentUserId(id));
  }

  onSelectAll(checked: boolean) {
    this.store.toggleSelectAll(checked);
  }

  onItemSelect(event: { id: string; checked: boolean }) {
    this.store.toggleSelected(event.id, event.checked);
  }

  clearSelection() {
    this.store.clearSelection();
  }

  async onAddUser(): Promise<void> {
    this.addUserSelection.set([]);
    this.isAddUserSubmitting = false;
    await this.loadAddUserOptions('');

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.ADD_USER'),
        content: this.addUserContent,
        confirmText: this.translate.instant('GROUPS.ADD_USER_SUBMIT'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmDisabledSignal: computed(() => this.addUserSelection().length === 0),
      },
      width: '100%',
      panelClass: 'term-main-dialog',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitAddUsers(ref);
    };
  }

  private async submitAddUsers(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddUserSubmitting) return;
    const ids = this.addUserSelection();
    if (ids.length === 0) return;
    this.isAddUserSubmitting = true;
    try {
      await this.store.addUsers(ids);
      this.toast.success(this.translate.instant('GROUPS.ADD_USER_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.ADD_USER_FAILED'));
    } finally {
      this.isAddUserSubmitting = false;
    }
  }

  onEditRole(user: UserApiItem): void {
    if (this.isCurrentUser(user)) return;

    this.editingUserId.set(user.id);
    this.editRoleValue.set(user.groupAdmin ? 'admin' : 'user');
    this.isEditRoleSubmitting = false;

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.EDIT_ROLE_ACTION'),
        content: this.editRoleContent,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '100%',
      maxWidth: '480px',
      maxHeight: '90vh',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitEditRole(ref, user.id);
    };
  }

  private async submitEditRole(ref: MatDialogRef<DialogComponent>, userId: string): Promise<void> {
    if (this.isEditRoleSubmitting) return;

    if (this.isCurrentUserId(userId) && this.editRoleValue() === 'user') {
      this.toast.error(this.translate.instant('GROUPS.CANNOT_DEMOTE_SELF'));
      return;
    }

    this.isEditRoleSubmitting = true;
    try {
      await this.store.updateUserRole(userId, this.editRoleValue());
      this.toast.success(this.translate.instant('GROUPS.EDIT_ROLE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.EDIT_ROLE_FAILED'));
    } finally {
      this.isEditRoleSubmitting = false;
    }
  }

  onRemoveUser(user?: UserApiItem): void {
    if (user && this.isCurrentUser(user)) return;

    const ids = this.removableUserIds(user ? [user.id] : Array.from(this.store.selectedIds()));
    if (ids.length === 0) return;
    this.isRemoveSubmitting = false;

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.REMOVE_USER_TITLE'),
        content: this.removeUserContent,
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        buttonAlign: 'center',
        showDivider: true,
        confirmIcon: 'delete',
      },
      maxHeight: '90vh',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitRemoveUsers(ref, ids);
    };
  }

  private async submitRemoveUsers(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    if (this.isRemoveSubmitting) return;
    this.isRemoveSubmitting = true;
    try {
      await this.store.removeUsers(ids);
      this.toast.success(this.translate.instant('GROUPS.REMOVE_USER_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.REMOVE_USER_FAILED'));
    } finally {
      this.isRemoveSubmitting = false;
    }
  }

  changeRole(value: GroupUserRole) {
    this.editRoleValue.set(value);
  }

  private async loadAddUserOptions(searchText: string): Promise<void> {
    try {
      const users = await this.relatedApi.list({
        pageSize: 50,
        pageIndex: 1,
        query: searchText,
        excludeGroupId: this.store.groupId(),
      });
      this.userOptions = users.data.map((u) => ({
        value: u.id,
        label: u.displayName || u.name || u.userId,
      }));
    } catch {
      this.userOptions = [];
    }
  }
}
