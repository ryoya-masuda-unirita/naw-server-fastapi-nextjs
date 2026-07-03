import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl } from '@angular/forms';

@Component({
  selector: 'app-form-textarea',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './form-textarea.component.html',
})
export class FormTextareaComponent implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly textareaClass = input<string>('');
  readonly value = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly rows = input<number>(4);
  readonly textareaId = input<string>('');
  readonly areaHeight = input<number | undefined>(undefined);

  readonly valueChange = output<string>();
  readonly formBlur = output<void>();

  private readonly cvaValue = signal('');
  private readonly cvaDisabled = signal(false);

  readonly displayValue = computed(() => (this.ngControl ? this.cvaValue() : this.value()));
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

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

  innerValue = '';

  onInput(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.cvaValue.set(value);
    this.onChange?.(value);
    this.valueChange.emit(value);
  }

  onBlur() {
    this.onTouched?.();
    this.formBlur.emit();
  }
}
