import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TrainingDataFile } from '@app-types/training-data.types';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ChunkSelectComponent } from '@shared/components/select/chunk-select/chunk-select.component';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { FormSwitchComponent } from '@shared/components/form/form-switch/form-switch.component';

@Component({
  selector: 'app-training-data-edit-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    SvgIconComponent,
    ChunkSelectComponent,
    FormInputComponent,
    FormSwitchComponent,
  ],
  templateUrl: './training-data-edit-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingDataEditModalComponent {
  readonly form = input.required<FormGroup>();
  readonly formTick = input.required<number>();
  readonly submitted = input<boolean>(false);
  readonly editingFile = input.required<TrainingDataFile | null>();
  readonly editFilePreview = input.required<string | null>();

  readonly editFileChange = output<Event>();
  readonly removePreview = output<void>();

  private readonly translate = inject(TranslateService);

  getEditError(field: string): string {
    this.formTick(); // Trigger change detection
    const ctrl = this.form().get(field);
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
