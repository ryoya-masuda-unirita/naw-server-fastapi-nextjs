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
import { SelectOption } from '@app-types/common';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SelectComponent } from '@shared/components/select/select.component';

@Component({
  selector: 'app-form-select',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AppMatIconComponent, SelectComponent],
  templateUrl: './form-select.component.html',
  styleUrls: ['./form-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormSelectComponent<T = string> implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly error = input<string>('');
  readonly warning = input<string>('');
  readonly inputId = input<string>('');

  // app-select specific inputs
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('選択してください');
  readonly disabled = input<boolean>(false);
  readonly size = input<'default' | 'small'>('default');
  readonly width = input<string>('240px');
  readonly dropdownSupportText = input<string>('');
  readonly value = input<T | null>(null);

  readonly classNameInputSelect = input<string>('');

  readonly valueChange = output<T | null>();
  readonly formBlur = output<void>();

  private readonly cvaValue = signal<T | null>(null);
  private readonly cvaDisabled = signal(false);

  readonly activeValue = computed(() => (this.ngControl ? this.cvaValue() : this.value()));
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  private onChange?: (value: T | null) => void;
  private onTouched?: () => void;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: T | null): void {
    this.cvaValue.set(value);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  onSelectChange(value: T | null) {
    this.cvaValue.set(value);
    this.onChange?.(value);
    this.valueChange.emit(value);
    this.onTouched?.();
    this.formBlur.emit();
  }
}
