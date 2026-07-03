import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TrainingDataStore } from '../stores/training-data.store';
import { ROUTES } from '@core/constants/routes.config';
import { LoadingComponent } from '@shared/components/loading/loading.component';
import { TrainingDataDetailLocalComponent } from './components/local-view/local-view.component';
import { TrainingDataDetailCloudComponent } from './components/cloud-view/cloud-view.component';
import { MatDialog } from '@angular/material/dialog';
import { DialogComponent, DialogData } from '@shared/components';
import { Location } from '@angular/common';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { UiStore } from '@core/stores/ui.store';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import {
  FormRadioComponent,
  FormRadioOption,
} from '@shared/components/form/form-radio/form-radio.component';
import { FormSelectComponent } from '@shared/components/form/form-select/form-select.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { TrainingFolderModalService } from '../services/training-folder-modal.service';
import { buildIndexPayload } from '../utils/training-folder-form.helper';
import type { TrainingDataApiItem } from '@app-types/training-data.types';

@Component({
  selector: 'app-training-data-detail',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    LoadingComponent,
    TrainingDataDetailLocalComponent,
    TrainingDataDetailCloudComponent,
    IconButtonComponent,
    SvgIconComponent,
    ContextMenuComponent,
    ButtonComponent,
    FormInputComponent,
    FormTextareaComponent,
    FormRadioComponent,
    FormSelectComponent,
    CircularLoadingComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './training-data-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class TrainingDataDetailComponent implements OnInit {
  readonly id = input.required<string>();
  readonly store = inject(TrainingDataStore);
  readonly folderModal = inject(TrainingFolderModalService);
  readonly uiStore = inject(UiStore);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly location = inject(Location);
  readonly ROUTES = ROUTES;

  readonly item = this.store.selectedItem;
  readonly isLoading = this.store.isLoading;

  ngOnInit() {
    void this.store.loadDetail(this.id());
  }

  // Modal templates
  readonly editFolderFormTemplate = viewChild.required<TemplateRef<unknown>>('editFolderFormTpl');
  readonly editFolderActionsTemplate =
    viewChild.required<TemplateRef<unknown>>('editFolderActions');

  // Modal State
  private readonly fb = inject(FormBuilder);
  editFolderForm!: FormGroup;

  // Signal for form interaction tracking
  private readonly formTick = signal(0);
  readonly submitted = signal(false);
  readonly isSubmitting = signal(false);

  readonly serverOptions: FormRadioOption[] = [
    { label: this.translate.instant('LEARNING_DATA.SERVER_LOCAL'), value: 'LOCAL' },
    { label: this.translate.instant('LEARNING_DATA.SERVER_CLOUD'), value: 'SAAS_GLOBAL' },
  ];

  readonly isEditFolderValid = computed(() => {
    this.formTick();
    return this.editFolderForm?.valid && !this.folderModal.hasNoEndpoints();
  });

  readonly canSubmitEditFolder = computed(() => {
    this.formTick();
    if (this.folderModal.isLoading() || this.folderModal.hasNoEndpoints() || this.isSubmitting()) {
      return false;
    }

    const name = this.editFolderForm?.get('name')?.value;
    const server = this.editFolderForm?.get('server')?.value;
    if (!name) return false;

    if (server === 'SAAS_GLOBAL') {
      return this.folderModal.selectedEndpointIds().length === 2;
    }

    return !!this.editFolderForm?.get('endpointId')?.value;
  });

  readonly folderNameError = computed(() => {
    this.formTick();
    const ctrl = this.editFolderForm?.get('name');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly folderDescError = computed(() => {
    this.formTick();
    const ctrl = this.editFolderForm?.get('description');
    return ctrl && this.submitted() && ctrl.invalid ? this.resolveError(ctrl) : '';
  });

  readonly endpointError = computed(() => {
    this.formTick();
    const ctrl = this.editFolderForm?.get('endpointId');
    if (!ctrl || !this.submitted() || ctrl.valid) return '';
    return this.translate.instant('VALIDATION.REQUIRED');
  });

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

  goBack() {
    this.location.back();
  }

  onToggleSidebar() {
    this.uiStore.toggleMobileSidebar();
  }

  onRename() {
    const data = this.item();
    if (data) {
      void this.openEditModal(data);
    }
  }

  private async openEditModal(data: TrainingDataApiItem): Promise<void> {
    this.folderModal.reset();
    this.submitted.set(false);
    this.isSubmitting.set(false);

    this.editFolderForm = this.fb.group({
      name: [data.name, [Validators.required, Validators.maxLength(255)]],
      server: [data.type, [Validators.required]],
      description: [data.description ?? '', [Validators.maxLength(1000)]],
      fetchId: [data.get ?? ''],
      deleteId: [data.delete ?? ''],
      learnId: [data.add ?? ''],
      // SAAS_GLOBAL では endpointId の入力欄を表示しないため必須にしない（サーバー種別は編集画面で変更不可）
      endpointId: ['', data.type === 'LOCAL' ? [Validators.required] : []],
    });

    this.editFolderForm.valueChanges.subscribe(() => {
      this.formTick.update((n) => n + 1);
    });

    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('LEARNING_DATA.MENU.EDIT_SETTINGS'),
        content: this.editFolderFormTemplate(),
        customActions: this.editFolderActionsTemplate(),
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '800px',
      maxWidth: '90vw',
    });

    await this.folderModal.initializeGroups();
    const selectedId = await this.folderModal.loadEndpointsForType(data.type, data.endpointIds);
    if (data.type === 'LOCAL') {
      this.editFolderForm.patchValue({ endpointId: selectedId ?? '' });
    }
    this.formTick.update((n) => n + 1);
  }

  closeModal(): void {
    this.dialog.closeAll();
  }

  async submitEditFolder(): Promise<void> {
    const data = this.item();
    this.submitted.set(true);
    if (!data || !this.isEditFolderValid() || !this.canSubmitEditFolder() || this.isSubmitting()) {
      return;
    }

    const values = this.editFolderForm.value;
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
      await this.store.updateFolder(data.id, payload);
      this.closeModal();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onDeleteFolder() {
    const data = this.item();
    if (data) {
      const dialogRef = this.dialog.open(DialogComponent, {
        data: {
          title: this.translate.instant('LEARNING_DATA.DELETE_FOLDER_CONFIRM_TITLE'),
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
        autoFocus: false,
      });

      dialogRef.afterClosed().subscribe((result: boolean) => {
        if (result) {
          this.store.deleteFolder(data.id);
          this.goBack();
        }
      });
    }
  }
}
