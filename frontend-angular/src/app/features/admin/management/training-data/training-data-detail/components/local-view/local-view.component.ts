import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SelectOption } from '@app-types/common';
import {
  TrainingDataApiItem,
  TrainingDataFile,
  TrainingDataFileSortField,
} from '@app-types/training-data.types';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import {
  PeriodChange,
  PeriodOption,
} from '@shared/components/filter/period-filter/period-filter.component';
import { SortOption } from '@shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { TrainingDataStore } from '../../../stores/training-data.store';
import { DEFAULT_CHUNK_SIZE_PRESET } from '../../../utils/training-data-chunk-size.helper';
import { buildFileUserFilterOptions } from '../../../utils/training-data-files.helper';
import { TrainingDataActionBarComponent } from '../view-shared/training-data-action-bar.component';
import { TrainingDataAddModalComponent } from '../view-shared/training-data-add-modal.component';
import { TrainingDataEditModalComponent } from '../view-shared/training-data-edit-modal.component';
import { TrainingDataFiltersComponent } from '../view-shared/training-data-filters.component';
import { TrainingDataTableComponent } from '../view-shared/training-data-table.component';

@Component({
  selector: 'app-local-view',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SvgIconComponent,
    ButtonComponent,
    ReactiveFormsModule,
    TrainingDataTableComponent,
    TrainingDataAddModalComponent,
    TrainingDataEditModalComponent,
    TrainingDataActionBarComponent,
    TrainingDataFiltersComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './local-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'term-main md:pb-0 flex flex-col h-full',
    '[class.pb-38]': 'selectedFiles().length === 0 || isRenamingMode()',
    '[class.pb-55]': 'selectedFiles().length > 0 && !isRenamingMode()',
  },
})
export class TrainingDataDetailLocalComponent {
  readonly data = input.required<TrainingDataApiItem>();
  readonly store = inject(TrainingDataStore);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly filesFilter = this.store.filesFilter;

  readonly selectedFiles = signal<TrainingDataFile[]>([]);
  readonly isRenamingMode = signal(false);
  readonly isPreviewOpen = signal(false);
  readonly editingNames = signal<Record<string, { displayName: string; name: string }>>({});

  allSelected = computed(() => {
    const paginated = this.paginatedFiles();
    return paginated.length > 0 && this.selectedFiles().length === paginated.length;
  });

  someSelected = computed(() => {
    return this.selectedFiles().length > 0 && !this.allSelected();
  });

  selectAllChange = (checked: boolean) => {
    if (checked) {
      const paginated = this.paginatedFiles();
      this.selectedFiles.set(paginated);
      if (this.isRenamingMode()) {
        const currentEdits: Record<string, { displayName: string; name: string }> = {};
        paginated.forEach((f) => {
          currentEdits[f.id] = { displayName: f.displayName, name: f.name };
        });
        this.editingNames.set(currentEdits);
      }
    } else {
      this.selectedFiles.set([]);
      this.isRenamingMode.set(false);
      this.editingNames.set({});
    }
  };

  isSelected(id: string): boolean {
    return this.selectedFiles()
      .map((item) => item.id)
      .includes(id);
  }

  toggleItemSelection(item: TrainingDataFile, checked: boolean): void {
    if (checked) {
      this.selectedFiles.update((files) => [...files, item]);
      if (this.isRenamingMode()) {
        this.editingNames.update((edits) => ({
          ...edits,
          [item.id]: { displayName: item.displayName, name: item.name },
        }));
      }
    } else {
      this.selectedFiles.update((files) => files.filter((f) => f.id !== item.id));
      if (this.isRenamingMode()) {
        this.editingNames.update((edits) => {
          const newEdits = { ...edits };
          delete newEdits[item.id];
          return newEdits;
        });
      }
    }

    if (this.selectedFiles().length === 0) {
      this.isRenamingMode.set(false);
      this.editingNames.set({});
    }
  }

  private readonly fb = inject(FormBuilder);
  addFilesForm!: FormGroup;
  editFileForm!: FormGroup;

  // Signal for form interaction tracking
  protected readonly formTick = signal(0);
  readonly submitted = signal(false);

  readonly linkPrefix = computed(() => this.addFilesForm?.get('linkPrefix')?.value || '');

  @ViewChild('addDataForm', { static: true }) addDataForm!: TemplateRef<any>;
  @ViewChild('addDataActions', { static: true }) addDataActions!: TemplateRef<any>;
  protected addDataDialogRef?: MatDialogRef<any>;

  @ViewChild('editDataForm', { static: true }) editDataForm!: TemplateRef<any>;
  @ViewChild('editDataActions', { static: true }) editDataActions!: TemplateRef<any>;
  protected editDataDialogRef?: MatDialogRef<any>;

  // Edit data modal state
  protected readonly editingFile = signal<TrainingDataFile | null>(null);
  protected readonly editFilePreview = signal<string | null>(null);
  protected readonly editUploadFile = signal<File | null>(null);
  protected readonly isAddSubmitting = signal(false);
  protected readonly isEditSubmitting = signal(false);

  protected readonly isEditFormValid = computed(() => {
    this.formTick();
    return this.editFileForm?.valid;
  });

  protected readonly isAddFilesValid = computed(() => {
    this.formTick();
    return this.addFilesForm?.valid && this.filesArray.length > 0;
  });

  get filesArray(): FormArray {
    return this.addFilesForm?.get('files') as FormArray;
  }

  getEditError(field: string): string {
    this.formTick();
    const ctrl = this.editFileForm?.get(field);
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  }

  getAddError(index: number, field: string): string {
    this.formTick();
    const ctrl = this.filesArray?.at(index)?.get(field);
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  }

  private resolveError(ctrl: any): string {
    if (ctrl.errors?.['required']) return this.translate.instant('VALIDATION.REQUIRED');
    if (ctrl.errors?.['maxlength']) {
      return this.translate.instant('VALIDATION.MAX_LENGTH', {
        max: ctrl.errors['maxlength'].requiredLength,
      });
    }
    return '';
  }

  readonly userOptions = computed(() =>
    buildFileUserFilterOptions(this.store.filterUsers(), (key) => this.translate.instant(key)),
  );

  readonly periodOptions = computed<PeriodOption[]>(() => [
    { value: '', label: 'LEARNING_DATA.ALL_PERIODS' },
    { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
    { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
    { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
    { value: 'custom', label: 'COMMON.PERIOD_FILTER.SPECIFY_PERIOD' },
  ]);

  readonly statusOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.translate.instant('LEARNING_DATA.ALL_SETTINGS') },
    { value: 'ON', label: 'ON' },
    { value: 'OFF', label: 'OFF' },
  ]);

  readonly chunkSizeOptions: SelectOption[] = [
    { value: 'small', label: 'チャンク分割：小' },
    { value: 'medium', label: 'チャンク分割：中' },
    { value: 'large', label: 'チャンク分割：大' },
  ];

  readonly sortOptions: SortOption[] = [
    { value: 'updatedAt', label: this.translate.instant('LEARNING_DATA.SORT_UPDATED_AT') },
    { value: 'displayName', label: '学習データの表示名順' },
    { value: 'updatedBy', label: this.translate.instant('LEARNING_DATA.SORT_UPDATED_BY') },
    {
      value: 'status',
      label: this.translate.instant('LEARNING_DATA.SORT_LEARNING_STATUS'),
    },
  ];

  readonly paginatedFiles = this.store.files;
  readonly isFilesLoading = this.store.isFilesLoading;

  readonly totalPages = this.store.filesTotalPages;

  readonly countDisplay = computed(() => {
    const range = this.store.filesPageRange();
    if (range.total === 0) return '0件';
    return `${range.from}-${range.to}件 / ${range.total}件`;
  });

  private indexId(): string {
    return this.data().id;
  }

  onSearch(q: string) {
    this.store.updateFilesFilter(this.indexId(), { query: q });
  }

  onRowClick(row: TrainingDataFile): void {
    this.toggleItemSelection(row, !this.isSelected(row.id));
  }

  onSortFieldChange(field: string | null) {
    this.store.updateFilesFilter(this.indexId(), {
      sortField: (field as TrainingDataFileSortField) || undefined,
    });
  }

  onSortOrderChange(order: string | null) {
    this.store.updateFilesFilter(this.indexId(), {
      sortOrder: (order as 'asc' | 'desc' | '') ?? 'desc',
    });
  }

  onPageChange(page: number) {
    this.store.updateFilesFilter(this.indexId(), { pageIndex: page }, { resetPage: false });
  }

  onUserChange(value: string | null) {
    this.store.updateFilesFilter(this.indexId(), { userId: value ?? '' });
  }

  onPeriodChange(event: PeriodChange) {
    this.store.updateFilesFilter(this.indexId(), {
      selectedPeriod: event.value,
      filterPeriodRange: event.range,
    });
  }

  onStatusChange(value: string | null) {
    this.store.updateFilesFilter(this.indexId(), { selectedStatus: value });
  }

  onSync(): void {
    this.store.syncFolder(this.data().id);
  }

  onDeselectAll(): void {
    this.selectedFiles.set([]);
    this.isRenamingMode.set(false);
    this.editingNames.set({});
  }

  onAddData(): void {
    this.addFilesForm = this.fb.group({
      files: this.fb.array([]),
      linkPrefix: [''],
    });

    this.addFilesForm.valueChanges.subscribe(() => {
      this.formTick.update((n) => n + 1);
    });

    this.submitted.set(false);

    this.addDataDialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.ADD_DATA_TITLE'),
        content: this.addDataForm,
        customActions: this.addDataActions,
        buttonAlign: 'right',
        showConfirm: false,
        showCancel: false,
      } as DialogData,
      width: '1200px',
      maxWidth: '90vw',
      panelClass: 'dialog-xl',
    });
  }

  onAddDataSp(): void {
    // Mobile SP uses the same edit form but for adding
    this.editingFile.set(null);
    this.editFilePreview.set(null);
    this.editUploadFile.set(null);

    this.initEditForm();
    this.submitted.set(false);

    this.editDataDialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.ADD_DATA_TITLE'),
        content: this.editDataForm,
        customActions: this.editDataActions,
        buttonAlign: 'right',
        showConfirm: false,
        showCancel: false,
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
    });
  }

  private initEditForm(file?: TrainingDataFile): void {
    this.editFileForm = this.fb.group({
      displayName: [file?.displayName || '', [Validators.required, Validators.maxLength(255)]],
      name: [file?.name || '', [Validators.required, Validators.maxLength(255)]],
      chunkSize: [file?.chunkSize || DEFAULT_CHUNK_SIZE_PRESET, [Validators.required]],
      status: [file?.status === 'ENABLE' || true],
    });

    this.editFileForm.valueChanges.subscribe(() => {
      this.formTick.update((n) => n + 1);
    });
  }

  onFilesSelected(files: File[]): void {
    files.forEach((file, index) => {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      const group = this.fb.group({
        file: [file],
        displayName: [nameWithoutExt, [Validators.required, Validators.maxLength(255)]],
        linkName: [nameWithoutExt, [Validators.required, Validators.maxLength(255)]],
        chunkSize: [DEFAULT_CHUNK_SIZE_PRESET, [Validators.required]],
        status: ['pending'],
      });
      this.filesArray.insert(index, group);
    });
  }

  onApplyLinkPrefix(): void {
    const prefix = this.linkPrefix();
    this.filesArray.controls.forEach((ctrl) => {
      const displayName = ctrl.get('displayName')?.value;
      ctrl.get('linkName')?.setValue(prefix + displayName);
    });
  }

  async onSubmitAddData(): Promise<void> {
    this.submitted.set(true);
    if (!this.isAddFilesValid() || this.isAddSubmitting()) return;

    this.isAddSubmitting.set(true);
    try {
      const folderId = this.data().id;
      const files = this.addFilesForm.value.files;
      await this.store.addFiles(folderId, files);
      this.addDataDialogRef?.close();
    } finally {
      this.isAddSubmitting.set(false);
    }
  }

  onRemoveFileFromUpload(index: number): void {
    this.filesArray.removeAt(index);
  }

  onDeleteSelected(): void {
    const ids = this.selectedFiles().map((f) => f.id);
    if (ids.length === 0) return;

    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.DELETE_DATA_CONFIRM_TITLE'),
        message: this.translate.instant('LEARNING_DATA.DELETE_CONFIRM_MESSAGE'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'center',
        confirmDanger: true,
        confirmIcon: 'delete',
      } as DialogData,
      width: '550px',
      maxWidth: '90vw',
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.store.deleteFiles(this.data().id, ids);
        this.onDeselectAll();
      }
    });
  }

  onDeleteFile(file: TrainingDataFile): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.DELETE_DATA_CONFIRM_TITLE'),
        message: this.translate.instant('LEARNING_DATA.DELETE_CONFIRM_MESSAGE'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'center',
        confirmDanger: true,
        confirmIcon: 'delete',
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.store.deleteFiles(this.data().id, [file.id]);
      }
    });
  }

  onPreview(file: TrainingDataFile): void {
    this.editFilePreview.set(file.image ?? null);
    this.isPreviewOpen.set(true);
  }

  closePreview(): void {
    this.isPreviewOpen.set(false);
  }

  onEditLearningData(file: TrainingDataFile): void {
    this.editingFile.set(file);
    this.editFilePreview.set(file.image ?? null);
    this.initEditForm(file);
    this.submitted.set(false);

    this.editDataDialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.EDIT_DATA_TITLE'),
        content: this.editDataForm,
        customActions: this.editDataActions,
        buttonAlign: 'right',
        showConfirm: false,
        showCancel: false,
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
    });
  }

  onToggleLearning(file: TrainingDataFile): void {
    const selectedItem = this.store.selectedItem();
    if (!selectedItem) return;
    void this.store.toggleFileLearning(selectedItem.id, file.id, file.status);
  }

  onSaveRename(): void {
    const folderId = this.data().id;
    const edits = this.editingNames();

    Object.entries(edits).forEach(([fileId, values]) => {
      const original = this.store.files().find((f) => f.id === fileId);
      if (original && original.displayName !== values.displayName) {
        void this.store.renameFile(folderId, fileId, values.displayName);
      }
    });

    this.isRenamingMode.set(false);
    this.editingNames.set({});
  }

  onEditName(file?: TrainingDataFile): void {
    if (file) {
      // If triggered from context menu, we might want to select only this file
      this.selectedFiles.set([file]);
    }

    const selected = this.selectedFiles();
    if (selected.length === 0) return;

    const currentEdits: Record<string, { displayName: string; name: string }> = {};
    selected.forEach((f) => {
      currentEdits[f.id] = { displayName: f.displayName, name: f.name };
    });

    this.editingNames.set(currentEdits);
    this.isRenamingMode.set(true);
  }

  updateEditingValue(id: string, field: 'displayName' | 'name', value: string): void {
    const edits = this.editingNames();
    if (edits[id]) {
      this.editingNames.set({
        ...edits,
        [id]: {
          ...edits[id],
          [field]: value,
        },
      });
    }
  }

  protected onEditFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');

    // If adding, set initial values from file name
    if (!this.editingFile()) {
      this.editUploadFile.set(file);
      this.editFileForm.patchValue({
        displayName: nameWithoutExt,
        name: file.name,
      });
    } else {
      // If editing, update the editing file's name with the new file name
      const currentFile = this.editingFile();
      if (currentFile) {
        this.editingFile.set({ ...currentFile, name: file.name });
        this.editFileForm.patchValue({ name: file.name });
      }
    }

    // Generate preview for image files
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editFilePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      this.editFilePreview.set(null);
    }
  }

  protected async onSubmitEditData(): Promise<void> {
    this.submitted.set(true);
    if (!this.isEditFormValid() || this.isEditSubmitting()) return;

    const file = this.editingFile();
    const values = this.editFileForm.value;

    this.isEditSubmitting.set(true);
    try {
      if (file) {
        await this.store.updateFile(
          this.data().id,
          file.id,
          {
            displayName: values.displayName,
            name: values.name,
            chunkSize: values.chunkSize,
            status: values.status ? 'ENABLE' : 'DISABLE',
          },
          this.editUploadFile() ?? undefined,
        );
      } else {
        const uploadFile = this.editUploadFile();
        await this.store.addFiles(this.data().id, [
          {
            file: uploadFile ?? undefined,
            displayName: values.displayName,
            name: values.name,
            chunkSize: values.chunkSize,
            status: values.status ? 'ENABLE' : 'DISABLE',
          },
        ]);
      }

      this.editDataDialogRef?.close();
    } finally {
      this.isEditSubmitting.set(false);
    }
  }
}
