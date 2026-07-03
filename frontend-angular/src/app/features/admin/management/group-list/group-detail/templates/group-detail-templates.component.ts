import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, DialogComponent, PaginationComponent } from '@shared/components';
import { ToastService } from '@core/services/toast.service';
import {
  GroupTemplatesFilterComponent,
  TemplatesFilterChange,
} from './components/group-templates-filter/group-templates-filter.component';
import { GroupTemplatesTableComponent } from './components/group-templates-table/group-templates-table.component';
import { GroupTemplatesStore } from '../../stores/group-templates.store';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { GroupTemplatesApiService } from '../../services/group-templates-api.service';
import {
  ComboboxOption,
  FormComboboxComponent,
} from '@app/shared/components/form/form-combobox/form-combobox.component';
import { TemplateApiItem } from '@app-types/admin/template.types';

@Component({
  selector: 'app-group-detail-templates',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
    GroupTemplatesFilterComponent,
    GroupTemplatesTableComponent,
    PaginationComponent,
    ButtonComponent,
    FormComboboxComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-detail-templates.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupDetailTemplatesComponent {
  readonly store = inject(GroupTemplatesStore);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly relatedApi = inject(GroupTemplatesApiService);

  @ViewChild('addTemplateContent') addTemplateContent!: TemplateRef<unknown>;
  @ViewChild('deleteTemplateContent') deleteTemplateContent!: TemplateRef<unknown>;

  /** Template ids selected in the add dialog. */
  readonly selectedTemplates = signal<string[]>([]);
  /** Populated lazily before the add dialog opens. */
  templateOptions: ComboboxOption[] = [];
  private isAddTemplateSubmitting = false;
  private isDeleteSubmitting = false;

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

  constructor() {
    effect(() => {
      const id = this.groupId();
      if (id) this.store.setGroup(id);
    });
  }

  onFilterChange(event: TemplatesFilterChange): void {
    this.store.updateFilter({
      search: event.query || undefined,
      sortField: (event.sortField as 'addedAt' | 'name') || undefined,
      sortOrder: event.sortOrder,
    });
  }

  onSelectAll(checked: boolean): void {
    this.store.toggleSelectAll(checked);
  }

  onItemSelect(event: { id: string; checked: boolean }): void {
    this.store.toggleSelected(event.id, event.checked);
  }

  async openAddTemplateModal(): Promise<void> {
    this.selectedTemplates.set([]);
    this.isAddTemplateSubmitting = false;
    await this.loadAddTemplateOptions('');

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.ADD_TEMPLATE'),
        content: this.addTemplateContent,
        confirmText: this.translate.instant('GROUPS.ADD_TEMPLATE_SUBMIT'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmDisabledSignal: computed(() => this.selectedTemplates().length === 0),
      },
      width: '100%',
      panelClass: 'term-main-dialog',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitAddTemplates(ref);
    };
  }

  private async submitAddTemplates(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddTemplateSubmitting) return;
    const ids = this.selectedTemplates();
    if (ids.length === 0) return;
    this.isAddTemplateSubmitting = true;
    try {
      await this.store.addTemplates(ids);
      this.toast.success(this.translate.instant('GROUPS.ADD_TEMPLATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.ADD_TEMPLATE_FAILED'));
    } finally {
      this.isAddTemplateSubmitting = false;
    }
  }

  deleteTemplate(id?: string): void {
    const ids = id ? [id] : Array.from(this.store.selectedIds());
    if (ids.length === 0) return;
    this.isDeleteSubmitting = false;

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.DELETE_TEMPLATE_TITLE'),
        content: this.deleteTemplateContent,
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
      void this.submitDeleteTemplates(ref, ids);
    };
  }

  private async submitDeleteTemplates(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    if (this.isDeleteSubmitting) return;
    this.isDeleteSubmitting = true;
    try {
      await this.store.removeTemplates(ids);
      this.toast.success(this.translate.instant('GROUPS.DELETE_TEMPLATE_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.DELETE_TEMPLATE_FAILED'));
    } finally {
      this.isDeleteSubmitting = false;
    }
  }

  private async loadAddTemplateOptions(search: string): Promise<void> {
    try {
      const res = await this.relatedApi.list({
        pageSize: 50,
        pageIndex: 1,
        search,
        excludeGroupId: this.groupId(),
      });
      this.templateOptions = res.content.map(({ id, name, description }: TemplateApiItem) => ({
        value: id,
        label: name,
        description,
      }));
    } catch {
      this.templateOptions = [];
    }
  }
}
