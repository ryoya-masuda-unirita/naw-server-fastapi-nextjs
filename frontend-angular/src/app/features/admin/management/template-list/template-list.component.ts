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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminTemplate } from '@app-types/admin/template.types';
import { SelectOption } from '@app-types/common';
import { ToastService } from '@core/services/toast.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, DialogComponent, PaginationComponent } from '@shared/components';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import { TemplateFormComponent } from './components/template-form/template-form.component';
import {
  TemplateFilterChange,
  TemplateListFilterComponent,
} from './components/template-list-filter/template-list-filter.component';
import { TemplateListItemsComponent } from './components/template-list-items/template-list-items.component';
import { GroupsApiService } from './services/groups-api.service';
import { TemplateListApiService } from './services/template-list-api.service';
import { TemplateListStore } from './stores/template-list.store';
import { GroupTemplatesApiService } from '../group-list/services/group-templates-api.service';

const TEAM_FILTER_ALL = '__all__';
const TEAM_FILTER_NONE = '__none__';

@Component({
  selector: 'app-admin-template-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatProgressSpinnerModule,
    AdminPageShellComponent,
    TemplateListFilterComponent,
    TemplateFormComponent,
    TemplateListItemsComponent,
    PaginationComponent,
    ButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './template-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class AdminTemplateListComponent implements OnInit {
  readonly store = inject(TemplateListStore);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly groupsApi = inject(GroupsApiService);
  private readonly groupTemplatesApi = inject(GroupTemplatesApiService);
  private readonly templateApi = inject(TemplateListApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  @ViewChild('addTemplateContent') addTemplateContent!: TemplateRef<unknown>;
  @ViewChild('editTemplateContent') editTemplateContent!: TemplateRef<unknown>;
  @ViewChild('deleteDialogContent') deleteDialogContent!: TemplateRef<unknown>;

  /**
   * Form-side options (id-based) used by `<app-multi-select>` inside the
   * MatDialog. Plain property, not a signal — the dialog's `<ng-template>` is
   * rendered detached from this component's CD tree, so signal updates don't
   * cross the boundary. `onAddTemplate()` / `onEditTemplate()` ensure the
   * array is populated before the dialog opens.
   */
  teamSelectOptions: SelectOption[] = [];
  /**
   * Filter-side option labels (group names). Used by `<app-template-list-filter>`,
   * which renders inline in the page (no detached view), so a signal works fine
   * and propagates through OnPush.
   */
  readonly teamFilterNames = signal<string[]>([]);
  readonly openMenuId = signal<string | null>(null);

  readonly addForm = this.buildTemplateForm();
  readonly editForm = this.buildTemplateForm();
  readonly isAddSubmitting = signal(false);
  readonly isEditSubmitting = signal(false);
  readonly isDeletingTemplate = signal(false);

  readonly addTemplateConfirmDisabled = toSignal(
    this.addForm.statusChanges.pipe(
      startWith(this.addForm.status),
      map(() => this.addForm.invalid),
    ),
    { initialValue: true },
  );

  readonly editTemplateConfirmDisabled = toSignal(
    this.editForm.statusChanges.pipe(
      startWith(this.editForm.status),
      map(() => this.editForm.invalid),
    ),
    { initialValue: false },
  );
  /** Id of the template currently being edited (used as PATCH path param). */
  private editingId: string | null = null;
  private editingGroupIds: string[] = [];

  private buildTemplateForm() {
    return this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      systemPrompt: ['', [Validators.required, Validators.maxLength(4000)]],
      description: ['', [Validators.maxLength(500)]],
      groups: this.fb.nonNullable.control<string[]>([]),
    });
  }

  readonly countDisplay = computed(() => {
    const r = this.store.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('TEMPLATES.PAGE_COUNT', {
      from: r.from,
      to: r.to,
      total: r.total,
    });
  });

  ngOnInit() {
    this.store.loadItems();
    void this.loadGroups();
  }

  private async loadGroups(): Promise<void> {
    try {
      const groups = await this.groupsApi.list();
      this.teamSelectOptions = groups.map((g) => ({ value: g.id, label: g.name }));
      this.teamFilterNames.set(groups.map((g) => g.name));
    } catch {
      this.teamSelectOptions = [];
      this.teamFilterNames.set([]);
    }
  }

  @HostListener('document:click')
  closeMenu() {
    if (this.openMenuId()) this.openMenuId.set(null);
  }

  onFilterChange(event: TemplateFilterChange) {
    let teamId: string | undefined;
    if (event.team === TEAM_FILTER_ALL) {
      teamId = undefined;
    } else if (event.team === TEAM_FILTER_NONE) {
      // '__none__' はそのままAPIに渡す（バックエンドが「グループなし」として処理）
      teamId = TEAM_FILTER_NONE;
    } else {
      // フィルターコンポーネントはグループ名を値として送るため、IDに変換してからStoreに渡す
      teamId = this.teamSelectOptions.find((o) => o.label === event.team)?.value as
        | string
        | undefined;
    }
    this.store.updateFilter({
      query: event.query || undefined,
      team: teamId,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  }

  toggleMenu(id: string) {
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  onSelectAll(checked: boolean) {
    this.store.toggleSelectAll(checked);
  }

  onItemSelect(event: { id: string; checked: boolean }) {
    this.store.toggleSelected(event.id, event.checked);
  }

  // ─── Add Template ────────────────────────────────────────────
  async onAddTemplate(): Promise<void> {
    // Ensure team options are loaded before the dialog opens — the embedded
    // view inside MatDialog won't pick up later property updates.
    if (this.teamSelectOptions.length === 0) {
      await this.loadGroups();
    }
    this.addForm.reset({ name: '', systemPrompt: '', description: '', groups: [] });
    this.isAddSubmitting.set(false);

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TEMPLATES.ADD_TEMPLATE_TITLE'),
        content: this.addTemplateContent,
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmMinWidth: 'min-w-[98px]',
        confirmDisabledSignal: this.addTemplateConfirmDisabled,
        confirmLoadingSignal: this.isAddSubmitting,
        confirmAction: () => {
          void this.submitAddTemplate(ref);
        },
      },
      // Astro `.modal-dialog`: w-full max-w-[480px] md:max-w-200 (800px).
      width: '100%',
      maxWidth: '800px',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  private async submitAddTemplate(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddSubmitting()) return;
    this.addForm.markAllAsTouched();
    if (this.addForm.invalid) return;

    this.isAddSubmitting.set(true);
    const value = this.addForm.getRawValue();
    const selectedGroupIds = [...new Set(value.groups)];
    try {
      const created = await this.templateApi.create({
        name: value.name.trim(),
        systemPrompt: value.systemPrompt.trim(),
        description: value.description.trim(),
      });
      await this.assignTemplateToGroups(created.id, selectedGroupIds);
      const idToName = this.groupIdToNameMap();
      this.store.addOne({
        id: created.id,
        name: created.name,
        systemPrompt: created.systemPrompt ?? '',
        description: created.description ?? '',
        teams: selectedGroupIds.map((groupId) => idToName.get(groupId) ?? groupId),
        updatedAt: created.updatedAt,
      });
      this.toast.success(this.translate.instant('TEMPLATES.CREATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('TEMPLATES.CREATE_FAILED'));
    } finally {
      this.isAddSubmitting.set(false);
    }
  }

  // ─── Edit Template ───────────────────────────────────────────
  async onEditTemplate(template: AdminTemplate): Promise<void> {
    if (this.teamSelectOptions.length === 0) {
      await this.loadGroups();
    }
    this.editingId = template.id;
    // Map team names back to group ids for the multi-select.
    const nameToId = new Map(this.teamSelectOptions.map((o) => [o.label, String(o.value)]));
    this.editingGroupIds = template.teams
      .map((team) => nameToId.get(team) ?? team)
      .filter((groupId, index, list) => list.indexOf(groupId) === index);
    this.editForm.reset({
      name: template.name,
      systemPrompt: template.systemPrompt,
      description: template.description,
      groups: this.editingGroupIds,
    });
    this.isEditSubmitting.set(false);

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TEMPLATES.EDIT_TEMPLATE_TITLE'),
        content: this.editTemplateContent,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmMinWidth: 'min-w-[98px]',
        buttonAlign: 'right',
        showDivider: true,
        confirmDisabledSignal: this.editTemplateConfirmDisabled,
        confirmLoadingSignal: this.isEditSubmitting,
        confirmAction: () => {
          void this.submitEditTemplate(ref);
        },
      },
      width: '100%',
      maxWidth: '800px',
      maxHeight: '90vh',
      autoFocus: false,
    });
  }

  private async submitEditTemplate(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isEditSubmitting() || !this.editingId) return;
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    this.isEditSubmitting.set(true);
    const value = this.editForm.getRawValue();
    const selectedGroupIds = [...new Set(value.groups)];
    try {
      const updated = await this.templateApi.update(this.editingId, {
        name: value.name.trim(),
        systemPrompt: value.systemPrompt.trim(),
        description: value.description.trim(),
      });
      await this.syncTemplateGroups(this.editingId, this.editingGroupIds, selectedGroupIds);
      const idToName = this.groupIdToNameMap();
      this.store.updateOne({
        id: updated.id,
        name: updated.name,
        systemPrompt: updated.systemPrompt ?? '',
        description: updated.description ?? '',
        teams: selectedGroupIds.map((groupId) => idToName.get(groupId) ?? groupId),
        updatedAt: updated.updatedAt,
      });
      this.editingGroupIds = selectedGroupIds;
      this.toast.success(this.translate.instant('TEMPLATES.UPDATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('TEMPLATES.UPDATE_FAILED'));
    } finally {
      this.isEditSubmitting.set(false);
    }
  }

  private groupIdToNameMap(): Map<string, string> {
    return new Map(this.teamSelectOptions.map((option) => [String(option.value), option.label]));
  }

  private async assignTemplateToGroups(templateId: string, groupIds: string[]): Promise<void> {
    await Promise.all(
      groupIds.map((groupId) => this.groupTemplatesApi.addTemplates(groupId, [templateId])),
    );
  }

  private async syncTemplateGroups(
    templateId: string,
    previousGroupIds: string[],
    nextGroupIds: string[],
  ): Promise<void> {
    const previous = new Set(previousGroupIds);
    const next = new Set(nextGroupIds);
    const removals = [...previous].filter((groupId) => !next.has(groupId));
    const additions = [...next].filter((groupId) => !previous.has(groupId));

    await Promise.all(
      removals.map((groupId) => this.groupTemplatesApi.remove(groupId, templateId)),
    );
    await this.assignTemplateToGroups(templateId, additions);
  }

  // ─── Delete Template ─────────────────────────────────────────
  onDeleteTemplate(template?: AdminTemplate) {
    const ids = template ? [template.id] : Array.from(this.store.selectedIds());
    if (ids.length === 0) return;
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('TEMPLATES.DELETE_TEMPLATE_TITLE'),
        content: this.deleteDialogContent,
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'center',
        showDivider: true,
        confirmLoadingSignal: this.isDeletingTemplate,
        confirmAction: () => {
          void this.submitDeleteTemplates(ref, ids);
        },
      },
      maxHeight: '90vh',
    });
  }

  private async submitDeleteTemplates(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    this.isDeletingTemplate.set(true);
    try {
      await Promise.all(ids.map((id) => this.templateApi.deleteOne(id)));
      this.store.removeMany(ids);
      this.toast.success(this.translate.instant('TEMPLATES.DELETE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('TEMPLATES.DELETE_FAILED'));
    } finally {
      this.isDeletingTemplate.set(false);
    }
  }

  clearSelection() {
    this.store.clearSelection();
  }
}
