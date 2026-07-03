import { Component, input, output, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { SelectOption } from '@app-types/common';

export interface UsageLimitFormData {
  monthlyLimit: string;
  dailyLimit: string;
  alertPercentage: string | null;
  dailyAlertPercentage: string | null;
}

@Component({
  selector: 'app-usage-limit-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormInputComponent, SelectComponent, SvgIconComponent],
  templateUrl: './usage-limit.component.html',
  styleUrl: './usage-limit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageLimitDialogComponent {
  readonly formData = input.required<UsageLimitFormData>();
  readonly formDataChange = output<UsageLimitFormData>();
  readonly mode = input<'monthly' | 'daily'>('monthly');

  private readonly monthlyLimitTouched = signal(false);

  readonly isDaily = computed(() => this.mode() === 'daily');

  readonly limitError = computed(() => {
    if (!this.monthlyLimitTouched()) return '';
    const value = this.isDaily() ? this.formData().dailyLimit : this.formData().monthlyLimit;
    if (!value) return '';
    if (Number(value) <= 0) return '1以上の数値を入力してください';
    return '';
  });

  readonly alertOptions = computed<SelectOption[]>(() => {
    const prefix = this.isDaily() ? '日間' : '月間';
    return [
      { value: '60', label: `${prefix}上限の60 %` },
      { value: '70', label: `${prefix}上限の70 %` },
      { value: '80', label: `${prefix}上限の80 %` },
      { value: '90', label: `${prefix}上限の90 %` },
      { value: '95', label: `${prefix}上限の95 %` },
    ];
  });

  updateLimit(value: string): void {
    this.monthlyLimitTouched.set(true);
    const numeric = value.replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    if (this.isDaily()) {
      this.formDataChange.emit({ ...this.formData(), dailyLimit: numeric });
    } else {
      this.formDataChange.emit({ ...this.formData(), monthlyLimit: numeric });
    }
  }

  updateAlertPercentage(value: string): void {
    if (this.isDaily()) {
      this.formDataChange.emit({ ...this.formData(), dailyAlertPercentage: value });
    } else {
      this.formDataChange.emit({ ...this.formData(), alertPercentage: value });
    }
  }
}
