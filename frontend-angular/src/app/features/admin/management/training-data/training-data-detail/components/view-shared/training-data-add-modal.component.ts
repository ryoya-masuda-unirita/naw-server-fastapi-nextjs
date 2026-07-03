import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormGroup, FormArray, ReactiveFormsModule } from '@angular/forms';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { FileUploadComponent } from '@shared/components/file/file-upload/file-upload.component';
import { ChunkSelectComponent } from '@shared/components/select/chunk-select/chunk-select.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';

@Component({
  selector: 'app-training-data-add-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    SvgIconComponent,
    FileUploadComponent,
    ChunkSelectComponent,
    ButtonComponent,
    IconButtonComponent,
  ],
  templateUrl: './training-data-add-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingDataAddModalComponent {
  readonly form = input.required<FormGroup>();
  readonly formTick = input.required<number>();
  readonly submitted = input<boolean>(false);

  readonly filesSelected = output<File[]>();
  readonly removeFileFromUpload = output<number>();
  readonly applyLinkPrefix = output<void>();

  private readonly translate = inject(TranslateService);

  get filesArray(): FormArray {
    return this.form().get('files') as FormArray;
  }

  getAddError(index: number, field: string): string {
    this.formTick(); // Trigger change detection
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
}
