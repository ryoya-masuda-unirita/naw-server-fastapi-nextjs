import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TrainingDataStore } from './stores/training-data.store';
import { TrainingDataSortField, TrainingDataSortOrder } from '@app-types/training-data.types';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';

import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { FormSortInputComponent } from '@shared/components/form/form-sort-input/form-sort-input.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import {
  FormRadioComponent,
  FormRadioOption,
} from '@shared/components/form/form-radio/form-radio.component';
import { FormSelectComponent } from '@shared/components/form/form-select/form-select.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ROUTES } from '@core/constants/routes.config';
import { Router } from '@angular/router';
import { scrollToFirstFormError } from '@shared/utils/scroll-to-error';
import { TrainingFolderModalService } from './services/training-folder-modal.service';
import { buildIndexPayload, type TrainingFolderType } from './utils/training-folder-form.helper';

@Component({
  selector: 'app-training-data',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PageHeaderComponent,
    ButtonComponent,
    FormInputComponent,
    FormTextareaComponent,
    FormRadioComponent,
    FormSelectComponent,
    CircularLoadingComponent,
    ReactiveFormsModule,
    SearchInputComponent,
    FormSortInputComponent,
    PaginationComponent,
    SvgIconComponent,
  ],
  templateUrl: './training-data.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class TrainingDataComponent implements OnInit {
  readonly store = inject(TrainingDataStore);
  readonly folderModal = inject(TrainingFolderModalService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = this.store.items;
  readonly isLoading = this.store.isLoading;

  // Modal templates
  readonly createFolderFormTemplate =
    viewChild.required<TemplateRef<unknown>>('createFolderFormTpl');
  readonly createFolderActionsTemplate =
    viewChild.required<TemplateRef<unknown>>('createFolderActions');

  // Modal State
  readonly isCreateModalOpen = signal(false);
  private readonly fb = inject(FormBuilder);
  createFolderForm!: FormGroup;

  // Signal for form interaction tracking (similar to UserAddDialog pattern)
  private readonly formTick = signal(0);
  readonly submitted = signal(false);
  readonly isSubmitting = signal(false);

  private static readonly LOCAL_ONLY_FIELD_NAMES = [
    'endpointId',
    'fetchId',
    'deleteId',
    'learnId',
  ] as const;

  readonly serverOptions: FormRadioOption[] = [
    { label: this.translate.instant('LEARNING_DATA.SERVER_LOCAL'), value: 'LOCAL' },
    { label: this.translate.instant('LEARNING_DATA.SERVER_CLOUD'), value: 'SAAS_GLOBAL' },
  ];

  // Search State
  readonly searchQuery = signal('');

  // Sort State (used by FormSortInputComponent)
  readonly sortField = signal<TrainingDataSortField | null>(null);
  readonly sortDir = signal<TrainingDataSortOrder | null>(null);

  readonly sortFieldOptions = [
    { value: 'updatedAt', label: this.translate.instant('LEARNING_DATA.SORT_UPDATED_AT') },
    { value: 'name', label: this.translate.instant('LEARNING_DATA.SORT_FOLDER_NAME') },
    { value: 'type', label: this.translate.instant('LEARNING_DATA.SORT_SERVER') },
  ];

  readonly sortDirOptions = [
    { value: 'asc', label: this.translate.instant('LEARNING_DATA.SORT_ASC') },
    { value: 'desc', label: this.translate.instant('LEARNING_DATA.SORT_DESC') },
  ];

  // Pagination State
  readonly currentPage = computed(() => this.store.filter().pageIndex);
  readonly pageSize = computed(() => this.store.filter().pageSize);
  readonly totalItems = computed(() => this.store.totalItems());
  readonly totalPages = computed(() => this.store.totalPages());
  readonly countDisplay = computed(() => {
    const r = this.store.pageRange();
    if (r.total === 0) return '';
    return `${r.from}-${r.to}件 / ${r.total}件`;
  });

  readonly isCreateFolderValid = computed(() => {
    this.formTick();
    return this.createFolderForm?.valid && !this.folderModal.hasNoEndpoints();
  });

  readonly canSubmitCreateFolder = computed(() => {
    this.formTick();
    if (this.folderModal.isLoading() || this.folderModal.hasNoEndpoints() || this.isSubmitting()) {
      return false;
    }

    const name = this.createFolderForm?.get('name')?.value;
    const server = this.createFolderForm?.get('server')?.value;
    if (!name || !server) return false;

    if (server === 'SAAS_GLOBAL') {
      return this.folderModal.selectedEndpointIds().length === 2;
    }

    return !!this.createFolderForm?.get('endpointId')?.value;
  });

  readonly folderNameError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('name');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly folderDescError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('description');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly endpointError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('endpointId');
    if (!ctrl || !this.submitted() || ctrl.valid) return '';
    return this.translate.instant('VALIDATION.REQUIRED');
  });

  readonly fetchIdError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('fetchId');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly deleteIdError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('deleteId');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly learnIdError = computed(() => {
    this.formTick();
    const ctrl = this.createFolderForm?.get('learnId');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  onSortFieldChange(field: string | null): void {
    this.sortField.set(field as TrainingDataSortField | null);
    this.store.updateFilter({ sortField: (field as TrainingDataSortField) || undefined });
  }

  onSortOrderChange(dir: string | null): void {
    this.sortDir.set(dir as TrainingDataSortOrder);
    this.store.updateFilter({ sortOrder: dir as TrainingDataSortOrder });
  }

  ngOnInit() {
    this.store.loadItems();
  }

  private resolveError(ctrl: { errors?: Record<string, unknown> | null }): string {
    if (ctrl.errors?.['required']) return this.translate.instant('VALIDATION.REQUIRED');
    if (ctrl.errors?.['maxlength']) {
      const maxLength = ctrl.errors['maxlength'] as { requiredLength: number };
      return this.translate.instant('VALIDATION.MAX_LENGTH', {
        max: maxLength.requiredLength,
      });
    }
    return '';
  }

  openCreateModal(): void {
    this.folderModal.reset();

    this.createFolderForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      server: ['', [Validators.required]],
      description: ['', [Validators.maxLength(1000)]],
      fetchId: ['', [Validators.required]],
      deleteId: ['', [Validators.required]],
      learnId: ['', [Validators.required]],
      endpointId: ['', [Validators.required]],
    });

    this.createFolderForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formTick.update((n) => n + 1);
    });

    this.createFolderForm
      .get('server')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((server) => {
        void this.onServerTypeChange(server as TrainingFolderType | '');
      });

    this.submitted.set(false);
    this.isSubmitting.set(false);

    void this.folderModal.initializeGroups();

    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.CREATE_NEW_FOLDER'),
        content: this.createFolderFormTemplate(),
        customActions: this.createFolderActionsTemplate(),
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
      autoFocus: false,
    });
  }

  private setLocalOnlyValidators(server: TrainingFolderType | ''): void {
    for (const name of TrainingDataComponent.LOCAL_ONLY_FIELD_NAMES) {
      const control = this.createFolderForm.get(name);
      if (server === 'LOCAL') {
        control?.setValidators([Validators.required]);
      } else {
        control?.clearValidators();
      }
      control?.updateValueAndValidity({ emitEvent: false });
    }
  }

  private async onServerTypeChange(server: TrainingFolderType | ''): Promise<void> {
    const endpointControl = this.createFolderForm.get('endpointId');
    if (!server) {
      endpointControl?.setValue('');
      this.setLocalOnlyValidators(server);
      this.folderModal.endpointOptions.set([]);
      this.folderModal.hasNoEndpoints.set(false);
      this.folderModal.selectedEndpointIds.set([]);
      this.formTick.update((n) => n + 1);
      return;
    }

    this.setLocalOnlyValidators(server);

    const selectedId = await this.folderModal.loadEndpointsForType(server);
    endpointControl?.setValue(server === 'LOCAL' ? (selectedId ?? '') : '');
    this.formTick.update((n) => n + 1);
  }

  closeModal(): void {
    this.dialog.closeAll();
  }

  async submitCreateFolder(): Promise<void> {
    this.submitted.set(true);
    if (!this.isCreateFolderValid() || !this.canSubmitCreateFolder() || this.isSubmitting()) {
      setTimeout(
        () =>
          scrollToFirstFormError(this.createFolderForm, [
            { controlName: 'name', elementId: 'create-folder-name' },
            { controlName: 'description', elementId: 'create-folder-description' },
            { controlName: 'endpointId', elementId: 'create-folder-endpoint' },
            { controlName: 'fetchId', elementId: 'create-folder-fetch-id' },
            { controlName: 'deleteId', elementId: 'create-folder-delete-id' },
            { controlName: 'learnId', elementId: 'create-folder-learn-id' },
          ]),
        0,
      );
      return;
    }

    const values = this.createFolderForm.value;
    const endpointIds =
      values.server === 'SAAS_GLOBAL'
        ? this.folderModal.selectedEndpointIds()
        : [String(values.endpointId ?? '')];
    const payload = buildIndexPayload(
      {
        name: values.name,
        server: values.server,
        description: values.description,
        fetchId: values.fetchId,
        deleteId: values.deleteId,
        learnId: values.learnId,
      },
      this.folderModal.getGroupIds(),
      endpointIds,
    );

    this.isSubmitting.set(true);
    try {
      await this.store.createFolder(payload);
      this.closeModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.store.updateFilter({ query: query || undefined });
  }

  onPageChange(page: number): void {
    this.store.updatePageIndex(page);
  }

  navigateToDetail(id: string): void {
    this.router.navigate([ROUTES.APP.ADMIN_TRAINING_DATA_DETAIL(id)]);
  }
}
