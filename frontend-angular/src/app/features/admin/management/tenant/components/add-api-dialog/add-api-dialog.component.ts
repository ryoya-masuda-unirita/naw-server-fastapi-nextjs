import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { FormSelectComponent } from '@shared/components/form/form-select/form-select.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { SelectOption } from '@app-types/common';
import { MANAGEABLE_ENDPOINT_TYPE } from '../../tenant.constants';

export interface AddApiFormData {
  endpointName: string;
  type: string;
  endpoint: string;
  apiKey: string;
}

@Component({
  selector: 'app-add-api-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormInputComponent,
    FormSelectComponent,
    ButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './add-api-dialog.component.html',
  styleUrl: './add-api-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddApiDialogComponent {
  // Input: form data from parent
  readonly formData = input.required<AddApiFormData>();
  readonly isEdit = input<boolean>(false);

  // Output: emit changes back to parent
  readonly formDataChange = output<AddApiFormData>();
  readonly generateApiKeyClick = output<void>();

  readonly apiKeyGenerated = signal(false);
  readonly isCopied = signal(false);

  readonly connectionOptions = signal<SelectOption[]>([
    { label: 'Local Server', value: MANAGEABLE_ENDPOINT_TYPE },
  ]);

  updateField(field: keyof AddApiFormData, value: string): void {
    const updated = {
      ...this.formData(),
      [field]: value,
    };
    this.formDataChange.emit(updated);
  }

  generateApiKey(): void {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const key = Array.from(
      { length: 32 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('');
    this.updateField('apiKey', key);
    this.apiKeyGenerated.set(true);
    this.generateApiKeyClick.emit();
  }

  copyApiKey(): void {
    const key = this.formData().apiKey;
    if (key) {
      navigator.clipboard.writeText(key);
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 3000);
    }
  }
}
