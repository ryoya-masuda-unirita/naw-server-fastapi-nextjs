import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';

@Component({
  selector: 'app-rename-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormInputComponent],
  templateUrl: './rename-dialog.component.html',
  styleUrl: './rename-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenameDialogComponent {
  // Input: current value from parent
  readonly value = input.required<string>();

  // Output: emit changes back to parent
  readonly valueChange = output<string>();

  updateName(value: string): void {
    this.valueChange.emit(value);
  }
}
