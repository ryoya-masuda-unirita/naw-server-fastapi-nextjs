import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  ViewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter, map, startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import type { TabItem } from '@app-types/tab.type';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import { DialogComponent } from '@shared/components/dialog/dialog.component';
import { GroupFormComponent } from '../components/group-form/group-form.component';
import { GroupApiService } from '../services/group-api.service';
import { ToastService } from '@core/services/toast.service';
import { DropdownService } from '@core/services/dropdown.service';
import { GROUP_DETAIL_TAB_IDS } from '../group-list.constants';
import { ROUTES } from '@app/core/constants/routes.config';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { AuthStore } from '@core/stores/auth.store';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    MatIconModule,
    AdminPageShellComponent,
    PageHeaderComponent,
    GroupFormComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupDetailComponent {
  private static readonly MENU_WIDTH = 288;
  private static readonly MENU_GAP = 4;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly groupApi = inject(GroupApiService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly dropdownService = inject(DropdownService);
  private readonly fb = inject(FormBuilder);
  readonly authStore = inject(AuthStore);

  @ViewChild('editTeamContent') editTeamContent!: TemplateRef<unknown>;
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');

  private readonly groupId = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: '',
  });

  readonly groupName = signal<string>('');
  readonly isMenuOpen = signal<boolean>(false);
  readonly menuStyle = signal<{ top: string; left: string }>({ top: '0px', left: '0px' });
  readonly isEditSubmitting = signal<boolean>(false);

  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  readonly activeTabId = toSignal(
    this.router.events.pipe(
      takeUntilDestroyed(),
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.detectActiveTabFromUrl()),
    ),
    { initialValue: GROUP_DETAIL_TAB_IDS.USERS as string },
  );

  readonly tabs = computed<TabItem[]>(() => {
    const id = this.groupId();
    if (!id) return [];
    return [
      {
        id: GROUP_DETAIL_TAB_IDS.USERS,
        label: this.translate.instant('GROUPS.TAB_USERS'),
        route: `/admin/groups/${id}/users`,
      },
      {
        id: GROUP_DETAIL_TAB_IDS.ASSISTANTS,
        label: this.translate.instant('GROUPS.TAB_ASSISTANTS'),
        route: `/admin/groups/${id}/assistants`,
      },
      {
        id: GROUP_DETAIL_TAB_IDS.TEMPLATES,
        label: this.translate.instant('GROUPS.TAB_TEMPLATES'),
        route: `/admin/groups/${id}/templates`,
      },
    ];
  });

  constructor() {
    effect(() => {
      const id = this.groupId();
      if (!id) return;
      void untracked(() => this.loadGroup(id));
    });
  }

  private async loadGroup(id: string): Promise<void> {
    try {
      const group = await this.groupApi.getById(id);
      this.groupName.set(group.name);
    } catch {
      this.groupName.set('');
    }
  }

  private detectActiveTabFromUrl(): string {
    const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    if (last === GROUP_DETAIL_TAB_IDS.TEMPLATES) return GROUP_DETAIL_TAB_IDS.TEMPLATES;
    if (last === GROUP_DETAIL_TAB_IDS.ASSISTANTS) return GROUP_DETAIL_TAB_IDS.ASSISTANTS;
    return GROUP_DETAIL_TAB_IDS.USERS;
  }

  goBack(): void {
    void this.router.navigate([ROUTES.APP.ADMIN_GROUPS]);
  }

  toggleMenu(): void {
    if (this.isMenuOpen()) {
      this.isMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }

    const btn = this.menuTrigger()?.nativeElement;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      let left = rect.left;
      const maxLeft =
        window.innerWidth - GroupDetailComponent.MENU_WIDTH - GroupDetailComponent.MENU_GAP;
      if (left > maxLeft) {
        left = Math.max(GroupDetailComponent.MENU_GAP, maxLeft);
      }
      this.menuStyle.set({
        top: `${rect.bottom + GroupDetailComponent.MENU_GAP}px`,
        left: `${left}px`,
      });
    }

    this.isMenuOpen.set(true);
    this.dropdownService.open(() => this.isMenuOpen.set(false));
  }

  openEditDialog(): void {
    this.isMenuOpen.set(false);
    this.dropdownService.notifyClosed();

    const groupId = this.groupId();
    if (!groupId) return;

    this.isEditSubmitting.set(false);
    this.editForm.reset({ name: this.groupName() });

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.EDIT_TEAM_TITLE'),
        content: this.editTeamContent,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmLoadingSignal: this.isEditSubmitting,
      },
      width: '100%',
      maxWidth: '800px',
      maxHeight: '90vh',
    });
    ref.componentInstance.data.confirmAction = () => this.submitEdit(ref);
  }

  private async submitEdit(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isEditSubmitting()) return;
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    this.isEditSubmitting.set(true);
    const name = this.editForm.getRawValue().name.trim();
    try {
      const updated = await this.groupApi.update(this.groupId(), { name });
      this.groupName.set(updated.name);
      this.toast.success(this.translate.instant('GROUPS.UPDATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.UPDATE_FAILED'));
    } finally {
      this.isEditSubmitting.set(false);
    }
  }

  openDeleteDialog(): void {
    this.isMenuOpen.set(false);
    this.dropdownService.notifyClosed();

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.DELETE_GROUP'),
        message: this.translate.instant('GROUPS.DELETE_CONFIRM_MESSAGE'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        buttonAlign: 'right',
      },
    });
    ref.componentInstance.data.confirmAction = () => {
      void this.deleteGroup(ref);
    };
  }

  private async deleteGroup(ref: MatDialogRef<DialogComponent>): Promise<void> {
    try {
      await this.groupApi.delete(this.groupId());
      this.toast.success(this.translate.instant('GROUPS.DELETE_SUCCESS'));
      ref.close(true);
      void this.router.navigate([ROUTES.APP.ADMIN_GROUPS]);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.DELETE_FAILED'));
    }
  }
}
