import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { ControlValueAccessor, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppMatIconComponent } from '../../icons/mat-icon.component';
import { SvgIconComponent } from '../../icons/svg-icon.component';

@Component({
  selector: 'app-form-input',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    AppMatIconComponent,
    SvgIconComponent,
  ],
  templateUrl: './form-input.component.html',
  styleUrls: ['./form-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormInputComponent implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly type = input<'text' | 'password' | 'email' | 'number'>('text');
  readonly value = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly readOnly = input<boolean>(false, { alias: 'readonly' });
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly warning = input<string>('');
  readonly autocomplete = input<string>('');
  readonly icon = input<string>('');
  readonly size = input<'default' | 'small'>('default');
  readonly clearable = input<boolean>(false);
  readonly showPasswordToggle = input<boolean>(false);
  readonly asciiOnly = input<boolean>(false);
  readonly inputId = input<string>('');
  readonly classLabel = input<string>('');
  readonly endAdornment = input<TemplateRef<unknown>>();

  readonly valueChange = output<string>();
  readonly formBlur = output<void>();

  readonly isFocused = signal(false);
  readonly showPassword = signal(false);
  private readonly cvaValue = signal('');
  private readonly cvaDisabled = signal(false);

  readonly displayValue = computed(() => (this.ngControl ? this.cvaValue() : this.value()));
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  readonly inputType = computed(() => {
    if (this.type() === 'password' && this.showPassword()) {
      return 'text';
    }
    return this.type();
  });

  private onChange?: (value: string) => void;
  private onTouched?: () => void;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: string): void {
    this.cvaValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    if (this.asciiOnly()) {
      const filtered = value.replace(/[^\x20-\x7E]/g, '');
      if (filtered !== value) {
        value = filtered;
        input.value = value;
      }
    }

    const maxLen = this.maxLength();
    if (maxLen !== null && value.length > maxLen) {
      value = value.slice(0, maxLen);
      input.value = value;
    }

    this.cvaValue.set(value);
    this.onChange?.(value);
    this.valueChange.emit(value);
  }

  onBlur() {
    this.onTouched?.();
    this.formBlur.emit();
  }

  togglePasswordVisibility() {
    this.showPassword.set(!this.showPassword());
  }
}
