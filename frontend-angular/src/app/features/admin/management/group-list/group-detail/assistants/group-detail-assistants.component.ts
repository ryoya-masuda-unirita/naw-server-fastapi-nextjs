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
  GroupAssistantsFilterComponent,
  AssistantsFilterChange,
} from './components/group-assistants-filter/group-assistants-filter.component';
import { GroupAssistantsTableComponent } from './components/group-assistants-table/group-assistants-table.component';
import { GroupAssistantsStore } from '../../stores/group-assistants.store';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { GroupAssistantsApiService } from '../../services/group-assistants-api.service';
import {
  ComboboxOption,
  FormComboboxComponent,
} from '@app/shared/components/form/form-combobox/form-combobox.component';
import { AssistantApiItem } from '@app-types/admin/assistant.types';

@Component({
  selector: 'app-group-detail-assistants',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
    GroupAssistantsFilterComponent,
    GroupAssistantsTableComponent,
    PaginationComponent,
    ButtonComponent,
    FormComboboxComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-detail-assistants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupDetailAssistantsComponent {
  readonly store = inject(GroupAssistantsStore);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly relatedApi = inject(GroupAssistantsApiService);

  @ViewChild('addAssistantContent') addAssistantContent!: TemplateRef<unknown>;
  @ViewChild('deleteAssistantContent') deleteAssistantContent!: TemplateRef<unknown>;

  /** Assistant ids selected in the add dialog. */
  readonly selectedAssistants = signal<string[]>([]);
  /** Populated lazily before the add dialog opens. */
  assistantOptions: ComboboxOption[] = [];
  private isAddAssistantSubmitting = false;
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

  onFilterChange(event: AssistantsFilterChange): void {
    this.store.updateFilter({
      search: event.query || undefined,
      type: event.typeFilter || undefined,
      categoryId: event.categoryFilter || undefined,
      sortField: (event.sortField as 'addedAt' | 'name' | 'server' | 'category') || undefined,
      sortOrder: event.sortOrder,
    });
  }

  onSelectAll(checked: boolean): void {
    this.store.toggleSelectAll(checked);
  }

  onItemSelect(event: { id: string; checked: boolean }): void {
    this.store.toggleSelected(event.id, event.checked);
  }

  async openAddAssistantModal(): Promise<void> {
    this.selectedAssistants.set([]);
    this.isAddAssistantSubmitting = false;
    await this.loadAddAssistantOptions('');

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.ADD_ASSISTANT'),
        content: this.addAssistantContent,
        confirmText: this.translate.instant('GROUPS.ADD_ASSISTANT_SUBMIT'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
        confirmDisabledSignal: computed(() => this.selectedAssistants().length === 0),
      },
      width: '100%',
      panelClass: 'term-main-dialog',
    });

    ref.componentInstance.data.confirmAction = () => {
      void this.submitAddAssistants(ref);
    };
  }

  private async submitAddAssistants(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddAssistantSubmitting) return;
    const ids = this.selectedAssistants();
    if (ids.length === 0) return;
    this.isAddAssistantSubmitting = true;
    try {
      await this.store.addAssistants(ids);
      this.toast.success(this.translate.instant('GROUPS.ADD_ASSISTANT_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.ADD_ASSISTANT_FAILED'));
    } finally {
      this.isAddAssistantSubmitting = false;
    }
  }

  openDeleteSelectedModal(): void {
    this.deleteAssistant();
  }

  deleteAssistant(id?: string): void {
    const ids = id ? [id] : Array.from(this.store.selectedIds());
    if (ids.length === 0) return;
    this.isDeleteSubmitting = false;

    const ref: MatDialogRef<DialogComponent> = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('GROUPS.DELETE_ASSISTANT_TITLE'),
        content: this.deleteAssistantContent,
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
      void this.submitDeleteAssistants(ref, ids);
    };
  }

  private async submitDeleteAssistants(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    if (this.isDeleteSubmitting) return;
    this.isDeleteSubmitting = true;
    try {
      await this.store.removeAssistants(ids);
      this.toast.success(this.translate.instant('GROUPS.DELETE_ASSISTANT_SUCCESS'));
      ref.close(true);
    } catch {
      this.toast.error(this.translate.instant('GROUPS.DELETE_ASSISTANT_FAILED'));
    } finally {
      this.isDeleteSubmitting = false;
    }
  }

  private async loadAddAssistantOptions(search: string): Promise<void> {
    try {
      const assistantsRes = await this.relatedApi.list({
        pageSize: 50,
        pageIndex: 1,
        search,
        excludeGroupId: this.groupId(),
      });
      this.assistantOptions = assistantsRes.content.map(
        ({ id, name, description, category }: AssistantApiItem) => ({
          value: id,
          label: name,
          description,
          tag: category?.name,
        }),
      );
    } catch {
      this.assistantOptions = [];
    }
  }
}
