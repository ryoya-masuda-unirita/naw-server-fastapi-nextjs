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
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SwitchComponent } from '@shared/components/switch/switch.component';

@Component({
  selector: 'app-form-switch',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AppMatIconComponent, SwitchComponent],
  templateUrl: './form-switch.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormSwitchComponent implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly error = input<string>('');
  readonly warning = input<string>('');
  readonly inputId = input<string>('');

  // app-switch specific inputs
  readonly switchLabel = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly showIcon = input<boolean>(true);
  readonly checked = input<boolean>(false);

  readonly checkedChange = output<boolean>();
  readonly formBlur = output<void>();

  private readonly cvaValue = signal<boolean>(false);
  private readonly cvaDisabled = signal(false);

  readonly activeValue = computed(() => (this.ngControl ? this.cvaValue() : this.checked()));
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  private onChange?: (value: boolean) => void;
  private onTouched?: () => void;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: boolean): void {
    this.cvaValue.set(value ?? false);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  onSwitchChange(value: boolean) {
    this.cvaValue.set(value);
    this.onChange?.(value);
    this.checkedChange.emit(value);
    this.onTouched?.();
    this.formBlur.emit();
  }
}
