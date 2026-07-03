import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import { MatIconModule } from '@angular/material/icon';
import { SelectOption } from '@app-types/common';

@Component({
  selector: 'app-add-training-data-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormInputComponent,
    FormTextareaComponent,
    MatIconModule,
  ],
  templateUrl: './add-training-data-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddTrainingDataDialogComponent {
  // Inputs from parent
  readonly fileName = input.required<string>();
  readonly displayName = input.required<string>();
  readonly link = input.required<string>();
  readonly status = input.required<string>();
  readonly statusOptions = input.required<SelectOption[]>();

  // Outputs to emit changes back to parent
  readonly fileNameChange = output<string>();
  readonly displayNameChange = output<string>();
  readonly linkChange = output<string>();
  readonly statusChange = output<string>();

  updateFileName(value: string): void {
    this.fileNameChange.emit(value);
  }

  updateDisplayName(value: string): void {
    this.displayNameChange.emit(value);
  }

  updateLink(value: string): void {
    this.linkChange.emit(value);
  }

  updateStatus(value: string | null): void {
    if (value) {
      this.statusChange.emit(value);
    }
  }
}
