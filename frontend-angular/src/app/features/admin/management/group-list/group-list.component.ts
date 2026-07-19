import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastService } from '@core/services/toast.service';
import { ButtonComponent, DialogComponent, PaginationComponent } from '@shared/components';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import {
  GroupListFilterChange,
  GroupListFilterComponent,
} from './components/group-list-filter/group-list-filter.component';
import { GroupListCardsComponent } from './components/group-list-cards/group-list-cards.component';
import { GroupFormComponent } from './components/group-form/group-form.component';
import { GroupApiService } from './services/group-api.service';
import { GroupListStore } from './stores/group-list.store';
import { UserApiItem } from '@app-types/admin/user.types';
import { AssistantApiItem } from '@app-types/admin/assistant.types';
import { TemplateApiItem } from '@app-types/admin/template.types';
import { GroupUsersApiService } from './services/group-users-api.service';
import { GroupAssistantsApiService } from './services/group-assistants-api.service';
import { GroupTemplatesApiService } from './services/group-templates-api.service';
import { AuthStore } from '@core/stores/auth.store';
import { GroupListItem } from '@app-types/admin/group-management.types';

@Component({
  selector: 'app-group-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatProgressSpinnerModule,
    AdminPageShellComponent,
    GroupListFilterComponent,
    GroupListCardsComponent,
    GroupFormComponent,
    PaginationComponent,
    ButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class GroupListComponent implements OnInit {
  readonly store = inject(GroupListStore);
  readonly authStore = inject(AuthStore);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly groupApi = inject(GroupApiService);
  private readonly usersApi = inject(GroupUsersApiService);
  private readonly assistantsApi = inject(GroupAssistantsApiService);
  private readonly templatesApi = inject(GroupTemplatesApiService);

  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  @ViewChild('addTeamContent') addTeamContent!: TemplateRef<unknown>;

  readonly addForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });
  readonly isAddSubmitting = signal(false);
  readonly canCreateTeam = computed(() => !this.authStore.isGroupAdminOnly());

  // Lookup tables for resolving ids → display names on list cards.
  private userIdToName = new Map<string, string>();
  private assistantIdToName = new Map<string, string>();
  private templateIdToName = new Map<string, string>();

  readonly countDisplay = computed(() => {
    const r = this.store.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('GROUPS.PAGE_COUNT', {
      from: r.from,
      to: r.to,
      total: r.total,
    });
  });

  ngOnInit() {
    this.store.setNameResolver((kind, ids) => this.resolveNames(kind, ids));
    void this.loadAndDisplay();
  }

  private async loadAndDisplay(): Promise<void> {
    await this.loadNameResolverMaps();
    await this.store.loadItems();
    await this.hydrateMissingMembershipInfo();
  }

  private async loadNameResolverMaps(): Promise<void> {
    try {
      const [usersRes, assistantsRes, promptTemplatesRes] = await Promise.all([
        this.usersApi.list({ pageSize: 1000, pageIndex: 1, sortField: 'updatedAt' }),
        this.assistantsApi.list({
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'name',
        }),
        this.templatesApi.list({
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'name',
        }),
      ]);

      this.userIdToName = new Map(
        usersRes.data.map(({ id, displayName }: UserApiItem) => [id, displayName]),
      );
      this.assistantIdToName = new Map(
        assistantsRes.content.map(({ id, name }: AssistantApiItem) => [id, name]),
      );
      this.templateIdToName = new Map(
        promptTemplatesRes.content.map(({ id, name }: TemplateApiItem) => [id, name]),
      );
    } catch {
      // Cards fall back to raw ids when lookup fails.
    }
  }

  private resolveNames(kind: 'user' | 'admin' | 'assistant' | 'template', ids: string[]): string[] {
    const map =
      kind === 'assistant'
        ? this.assistantIdToName
        : kind === 'template'
          ? this.templateIdToName
          : this.userIdToName;
    return ids.map((id) => map.get(id) ?? id);
  }

  private async hydrateMissingMembershipInfo(): Promise<void> {
    const items = this.store.items().filter((item) => this.hasMissingMembershipInfo(item));
    await Promise.all(items.map((item) => this.hydrateGroupMembershipInfo(item)));
  }

  private hasMissingMembershipInfo(item: GroupListItem): boolean {
    return (
      item.adminUserNames.length === 0 ||
      item.userNames.length === 0 ||
      item.assistants.length === 0 ||
      item.templates.length === 0
    );
  }

  private async hydrateGroupMembershipInfo(item: GroupListItem): Promise<void> {
    try {
      const [usersRes, assistantsRes, templatesRes] = await Promise.all([
        this.usersApi.listByGroup(item.id, {
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'updatedAt',
          sortOrder: 'desc',
        }),
        this.assistantsApi.listByGroup(item.id, {
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'name',
          sortOrder: 'asc',
        }),
        this.templatesApi.listByGroup(item.id, {
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'name',
          sortOrder: 'asc',
        }),
      ]);

      const userRows = usersRes.content;
      this.store.updateOne({
        ...item,
        adminUserNames:
          item.adminUserNames.length > 0
            ? item.adminUserNames
            : userRows.filter((user) => user.groupAdmin).map((user) => user.displayName),
        userNames:
          item.userNames.length > 0 ? item.userNames : userRows.map((user) => user.displayName),
        assistants:
          item.assistants.length > 0
            ? item.assistants
            : assistantsRes.content.map((assistant) => assistant.name),
        templates:
          item.templates.length > 0
            ? item.templates
            : templatesRes.content.map((template) => template.name),
      });
    } catch {
      // Keep the list item as-is when group-scoped hydration fails.
    }
  }

  onFilterChange(event: GroupListFilterChange) {
    this.store.updateFilter({
      query: event.query || undefined,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  }

  onAddTeam(): void {
    this.addForm.reset({ name: '' });
    this.isAddSubmitting.set(false);

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.ADD_TEAM_TITLE'),
        content: this.addTeamContent,
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '100%',
      maxWidth: '800px',
      maxHeight: '90vh',
    });
    ref.componentInstance.data.confirmAction = () => {
      void this.submitAdd(ref);
    };
  }

  private async submitAdd(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddSubmitting()) return;
    this.addForm.markAllAsTouched();
    if (this.addForm.invalid) return;

    this.isAddSubmitting.set(true);
    const name = this.addForm.getRawValue().name.trim();
    try {
      const created = await this.groupApi.create({ name });
      this.store.addOne({
        id: created.id,
        name: created.name,
        adminUserNames: [],
        userNames: [],
        assistants: [],
        templates: [],
        updatedAt: created.updatedAt,
      });
      this.toast.success(this.translate.instant('GROUPS.CREATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.CREATE_FAILED'));
    } finally {
      this.isAddSubmitting.set(false);
    }
  }
}
