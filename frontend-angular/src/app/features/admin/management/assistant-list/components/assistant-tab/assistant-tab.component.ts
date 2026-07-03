import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AssistantApiItem, AssistantMutationPayload } from '@app-types/admin/assistant.types';
import { SelectOption } from '@app-types/common';
import { ToastService } from '@core/services/toast.service';
import {
  FormSortInputComponent,
  SortOption,
} from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent,
  DialogComponent,
  PaginationComponent,
  SelectComponent,
  TableListComponent,
  TableListItemComponent,
} from '@shared/components';
import { AssistantListApiService } from '../../services/assistant-list-api.service';
import { AssistantListStore } from '../../stores/assistant-list.store';
import { AssistantAddDialogComponent } from './components/assistant-add-dialog.component';
import { AssistantEditDialogComponent } from './components/assistant-edit-dialog.component';
import { AssistantTabMenuComponent } from './components/assistant-tab-menu.component';
import { ASSISTANT_SERVER_TYPE, checkFolderWithServerCloud } from '../../assistant-list.constants';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-assistant-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonComponent,
    PaginationComponent,
    SelectComponent,
    FormSortInputComponent,
    SvgIconComponent,
    AssistantTabMenuComponent,
    TableListComponent,
    TableListItemComponent,
    AssistantAddDialogComponent,
    AssistantEditDialogComponent,
    SearchInputComponent,
  ],
  templateUrl: './assistant-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'term-main md:pb-0',
  },
})
export class AssistantTabComponent implements OnInit {
  readonly store = inject(AssistantListStore);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly assistantApi = inject(AssistantListApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  @ViewChild('addAssistantContent') addAssistantContent!: TemplateRef<unknown>;
  @ViewChild('editAssistantContent') editAssistantContent!: TemplateRef<unknown>;
  @ViewChild('deleteMessageContent') deleteMessageContent!: TemplateRef<unknown>;

  readonly selectedAssistants = signal<AssistantApiItem[]>([]);
  readonly searchInput = signal<string>('');
  private readonly searchSubject = new Subject<string>();

  readonly assistantTypeList = [
    { key: 'SAAS_CHAT', label: this.translate.instant('ADMIN.ASSISTANT.CLOUD_GENERAL') },
  ];

  readonly addForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(32)]],
      description: ['', [Validators.maxLength(1000)]],
      serverType: ['', [Validators.required]],
      serverApi: ['', [Validators.required]],
      categories: [[] as string[]],
      model: ['', [Validators.required]],
      indexId: [''],
      includeHistory: [false],
      iconColor: [''],
      groups: [[] as string[]],
      dictionaries: [[] as string[]],
      folder: [''],
      createdAt: [''],
      updatedAt: [''],
    },
    { validators: checkFolderWithServerCloud },
  );

  readonly editForm = this.fb.nonNullable.group(
    {
      id: [''],
      name: ['', [Validators.required, Validators.maxLength(32)]],
      description: ['', [Validators.maxLength(1000)]],
      serverType: ['', [Validators.required]],
      serverApi: ['', [Validators.required]],
      categories: [[] as string[]],
      model: ['', [Validators.required]],
      indexId: [''],
      includeHistory: [false],
      iconColor: [''],
      groups: [[] as string[]],
      dictionaries: [[] as string[]],
      folder: [''],
      createdAt: [''],
      updatedAt: [''],
    },
    { validators: checkFolderWithServerCloud },
  );

  readonly isAddSubmitting = signal(false);
  readonly isEditSubmitting = signal(false);
  private editingId: string | null = null;

  readonly sortFieldOptions: SortOption[] = [
    {
      value: 'updatedAt',
      label: this.translate.instant('ADMIN.ASSISTANT.SORT_UPDATED_AT'),
    },
    {
      value: 'name',
      label: this.translate.instant('ADMIN.ASSISTANT.SORT_DISPLAY_NAME'),
    },
    {
      value: 'includeHistory',
      label: this.translate.instant('ADMIN.ASSISTANT.SORT_HISTORY'),
    },
  ];

  constructor() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.store.updateFilter({ search: value, pageIndex: 0 });
      });
  }

  ngOnInit() {
    this.store.loadItems();
    this.store.loadOptions();
  }

  // Selection
  readonly allSelected = computed(() => {
    const items = this.store.items();
    return items.length > 0 && this.selectedAssistants().length === items.length;
  });

  readonly someSelected = computed(() => {
    return this.selectedAssistants().length > 0 && !this.allSelected();
  });

  selectAllChange(checked: boolean) {
    if (checked) {
      this.selectedAssistants.set([...this.store.items()]);
    } else {
      this.selectedAssistants.set([]);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedAssistants().some((item) => item.id === id);
  }

  toggleItemSelection(assistant: AssistantApiItem, checked: boolean): void {
    if (checked) {
      this.selectedAssistants.update((items) => [...items, assistant]);
    } else {
      this.selectedAssistants.update((items) => items.filter((a) => a.id !== assistant.id));
    }
  }

  onDeselectAll(): void {
    this.selectedAssistants.set([]);
  }

  // Filter & Pagination
  onSortChange(field: string | null, order: string | null) {
    this.store.updateFilter({
      sortField: field as any,
      sortOrder: order as any,
    });
  }

  onPageChange(page: number): void {
    this.store.updateFilter({ pageIndex: page - 1 });
  }

  onFilterChange(field: string, value: any) {
    this.store.updateFilter({
      [field]: value,
      pageIndex: 0,
    });
  }

  onSearchValueChange(value: string): void {
    this.searchInput.set(value);
    this.searchSubject.next(value);
  }

  // ─── Add Assistant ───────────────────────────────────────────
  onAddAssistant(): void {
    this.addForm.reset({
      name: '',
      serverType: '',
      serverApi: '',
      model: '',
      groups: [],
      dictionaries: [],
      description: '',
      categories: [],
      folder: '',
      includeHistory: false,
    });
    this.isAddSubmitting.set(false);

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.CREATE_ASSISTANT'),
        content: this.addAssistantContent,
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmMinWidth: 'min-w-24.5',
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => this.submitAddAssistant(ref);
  }

  displayItem(value: string, options: SelectOption[]) {
    return options.find((option) => option.value === value)?.label || '';
  }

  displayItems(values: string[], options: SelectOption[]) {
    return values.map((v) => this.displayItem(v, options)).join(', ');
  }

  private async submitAddAssistant(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isAddSubmitting()) return;
    this.addForm.markAllAsTouched();
    this.addForm.updateValueAndValidity();
    if (this.addForm.invalid) {
      this.focusFirstInvalidControl();
      return;
    }

    try {
      this.isAddSubmitting.set(true);
      const value = this.addForm.getRawValue();
      const payload = this.mapFormToApi(value);
      await this.assistantApi.create(payload);
      this.store.loadItems();
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.CREATE_ASSISTANT_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      this.toast.error(this.translate.instant('TEMPLATES.CREATE_FAILED'));
    } finally {
      this.isAddSubmitting.set(false);
    }
  }

  // ─── Edit Assistant ──────────────────────────────────────────
  onEditAssistant(assistant: AssistantApiItem): void {
    this.editingId = assistant.id;
    const editableEndpoint = this.getEditableEndpoint(assistant);
    const serverApi = this.isEndpointOptionAvailable(assistant.type, editableEndpoint?.id)
      ? (editableEndpoint?.id ?? '')
      : '';

    this.editForm.reset({
      id: assistant.id,
      name: assistant.name,
      description: assistant.description ?? '',
      serverType: assistant.type,
      serverApi,
      categories:
        assistant.categories?.map((category) => category.id) ??
        (assistant.category?.id ? [assistant.category.id] : []),
      model: serverApi ? editableEndpoint?.model || '' : '',
      indexId: assistant.indexId ?? '',
      includeHistory: assistant.includeHistory,
      iconColor: assistant.iconColor ?? '',
      groups: assistant.groups ?? [],
      dictionaries: [],
      folder: assistant.type === ASSISTANT_SERVER_TYPE.SAAS_RAG ? (assistant.indexId ?? '') : '',
      createdAt: '',
      updatedAt: '',
    });
    this.isEditSubmitting.set(false);

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.EDIT_ASSISTANT'),
        content: this.editAssistantContent,
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

    ref.componentInstance.data.confirmAction = () => this.submitEditAssistant(ref);
  }

  private async submitEditAssistant(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.isEditSubmitting() || !this.editingId) return;
    this.editForm.markAllAsTouched();
    this.editForm.updateValueAndValidity();
    if (this.editForm.invalid) {
      this.focusFirstInvalidControl();
      return;
    }

    try {
      this.isEditSubmitting.set(true);
      const value = this.editForm.getRawValue();
      const payload = this.mapFormToApi(value);
      await this.assistantApi.update(this.editingId, payload);
      this.store.loadItems();
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.UPDATE_ASSISTANT_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      this.toast.error(this.translate.instant('TEMPLATES.UPDATE_FAILED'));
    } finally {
      this.isEditSubmitting.set(false);
    }
  }

  // ─── Delete ──────────────────────────────────────────────────
  onDeleteAssistant(assistant: AssistantApiItem): void {
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.DELETE_ASSISTANT_TITLE'),
        content: this.deleteMessageContent,
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmIcon: 'delete',
        confirmMinWidth: 'min-w-30.5',
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        buttonAlign: 'center',
        showDivider: true,
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () =>
      this.submitDeleteAssistants(ref, [assistant.id]);
  }

  onDeleteSelected(): void {
    const ids = this.selectedAssistants().map((a) => a.id);
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.DELETE_ASSISTANT_TITLE'),
        content: this.deleteMessageContent,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        confirmMinWidth: 'min-w-30.5',
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'center',
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => this.submitDeleteAssistants(ref, ids);
  }

  private async submitDeleteAssistants(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    try {
      await Promise.all(ids.map((id) => this.assistantApi.deleteOne(id)));
      this.store.removeMany(ids);
      this.selectedAssistants.set(this.selectedAssistants().filter((a) => !ids.includes(a.id)));
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.DELETE_ASSISTANT_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.toast.error(
          this.translate.instant('ADMIN.ASSISTANT.DELETE_ASSISTANT_DEFAULT_CONFLICT'),
        );
      } else {
        this.toast.error(this.translate.instant('ADMIN.ASSISTANT.DELETE_FAILED'));
      }
    }
  }

  private mapFormToApi(value: any): AssistantMutationPayload {
    const categoryIds = (value.categories ?? []).filter(
      (categoryId: string) => categoryId !== 'NONE',
    );
    const indexId = value.serverType === ASSISTANT_SERVER_TYPE.SAAS_RAG ? value.folder || null : '';

    return {
      type: value.serverType,
      name: value.name,
      description: value.description,
      includeHistory: value.includeHistory,
      iconColor: value.iconColor,
      groups: (value.groups ?? []).filter((groupId: string) => groupId !== 'NONE'),
      categoryIds,
      indexId,
      endpoints: [
        {
          id: value.serverApi,
          model: value.model,
          url: '',
        },
      ],
    };
  }

  private getEditableEndpoint(
    assistant: AssistantApiItem,
  ): AssistantApiItem['endpoints'][number] | undefined {
    if (assistant.type === ASSISTANT_SERVER_TYPE.SECURE) {
      return (
        assistant.endpoints.find((endpoint) => endpoint.type === 'LOCAL_SERVER') ??
        assistant.endpoints[0]
      );
    }

    return (
      assistant.endpoints.find((endpoint) => String(endpoint.type).includes('CHAT')) ??
      assistant.endpoints[0]
    );
  }

  private isEndpointOptionAvailable(type: string, endpointId?: string): boolean {
    if (!endpointId) return false;
    return this.store.serverApiOptions()[type]?.some((option) => option.value === endpointId);
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
