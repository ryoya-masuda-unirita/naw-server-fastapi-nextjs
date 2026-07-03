import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { OverlayModule } from '@angular/cdk/overlay';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  tag?: string;
  category?: string;
}

@Component({
  selector: 'app-form-combobox',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule, OverlayModule],
  templateUrl: './form-combobox.component.html',
})
export class FormComboboxComponent implements ControlValueAccessor {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('選択してください');
  readonly searchPlaceholder = input<string>('検索できます');
  readonly options = input<ComboboxOption[]>([]);
  readonly disabled = input<boolean>(false);
  readonly error = input<string>('');
  readonly inputId = input<string>('');
  readonly value = input<string[]>([]);

  readonly valueChange = output<string[]>();
  readonly formBlur = output<void>();

  private readonly cvaValue = signal<string[]>([]);
  private readonly cvaDisabled = signal(false);

  readonly isOpen = signal(false);
  readonly searchQuery = signal('');

  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  readonly activeValue = computed(() => (this.ngControl ? this.cvaValue() : this.value()));

  readonly filteredOptions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.options();
    return this.options().filter((opt) => opt.label.toLowerCase().includes(query));
  });

  readonly isAllSelected = computed(() => {
    const fOptions = this.filteredOptions();
    if (fOptions.length === 0) return false;
    const value = this.activeValue();
    return fOptions.every((opt) => value.includes(opt.value));
  });

  readonly isIndeterminate = computed(() => {
    const fOptions = this.filteredOptions();
    if (fOptions.length === 0) return false;
    const value = this.activeValue();
    const selectedCount = fOptions.filter((opt) => value.includes(opt.value)).length;
    return selectedCount > 0 && selectedCount < fOptions.length;
  });

  readonly selectedOptions = computed(() => {
    const value = this.activeValue();
    return this.options().filter((o) => value.includes(o.value));
  });

  private onChange?: (value: string[]) => void;
  private onTouched?: () => void;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  isOptionSelected(option: ComboboxOption): boolean {
    return this.activeValue().includes(option.value);
  }

  writeValue(value: string[] | null): void {
    this.cvaValue.set(value ?? []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  toggleDropdown() {
    if (this.isDisabled()) return;
    this.isOpen.set(!this.isOpen());
    if (this.isOpen()) {
      this.searchQuery.set('');
    } else {
      this.onBlur();
    }
  }

  closeDropdown() {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onBlur();
    }
  }

  onBlur() {
    this.onTouched?.();
    this.formBlur.emit();
  }

  toggleAll() {
    const currentAll = this.isAllSelected();
    const currentValues = new Set(this.activeValue());

    if (currentAll) {
      // Deselect all filtered
      this.filteredOptions().forEach((opt) => {
        currentValues.delete(opt.value);
      });
    } else {
      // Select all filtered
      this.filteredOptions().forEach((opt) => {
        if (!opt.disabled) {
          currentValues.add(opt.value);
        }
      });
    }

    this.updateValue(Array.from(currentValues));
  }

  toggleOption(option: ComboboxOption) {
    if (option.disabled) return;
    const currentValues = new Set(this.activeValue());
    if (currentValues.has(option.value)) {
      currentValues.delete(option.value);
    } else {
      currentValues.add(option.value);
    }

    this.updateValue(Array.from(currentValues));
  }

  onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleDropdown();
    } else if (event.key === 'Escape') {
      this.closeDropdown();
    }
  }

  onSelectAllKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleAll();
    }
  }

  onOptionKeydown(event: KeyboardEvent, option: ComboboxOption) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleOption(option);
    }
  }

  removeOption(event: Event, option: ComboboxOption) {
    event.stopPropagation();
    const currentValues = new Set(this.activeValue());
    if (currentValues.has(option.value)) {
      currentValues.delete(option.value);
      this.updateValue(Array.from(currentValues));
    }
  }

  private updateValue(value: string[]) {
    this.cvaValue.set(value);
    this.onChange?.(value);
    this.valueChange.emit(value);
  }
}
