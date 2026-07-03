import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SvgIconComponent } from '../../icons/svg-icon.component';

export interface FormRadioOption {
  label: string;
  value: any;
  disabled?: boolean;
}

@Component({
  selector: 'app-form-radio',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, SvgIconComponent],
  templateUrl: './form-radio.component.html',
  styleUrls: ['./form-radio.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class FormRadioComponent implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input<string>('');
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly error = input<string>('');
  readonly warning = input<string>('');
  readonly options = input.required<FormRadioOption[]>();
  readonly layout = input<'horizontal' | 'vertical'>('horizontal');
  readonly name = input<string>('');
  readonly value = input<any>(null);
  readonly inputClass = input<string>('');

  readonly valueChange = output<any>();
  readonly formBlur = output<void>();

  readonly classOption = input<string>('');

  private readonly cvaValue = signal<any>(null);
  private readonly cvaDisabled = signal(false);

  readonly displayValue = computed(() => (this.ngControl ? this.cvaValue() : this.value()));
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  readonly uniqueName = `radio-${Math.random().toString(36).substring(2, 9)}`;

  private onChange?: (value: any) => void;
  private onTouched?: () => void;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: any): void {
    this.cvaValue.set(value);
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  onSelect(value: any) {
    if (this.isDisabled()) return;
    this.cvaValue.set(value);
    this.onChange?.(value);
    this.valueChange.emit(value);
  }

  onBlur() {
    this.onTouched?.();
    this.formBlur.emit();
  }
}
