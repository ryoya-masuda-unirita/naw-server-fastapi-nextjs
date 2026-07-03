/**
 * Select Component - Reusable select dropdown control
 * Following Figma design specifications
 *
 * Features:
 * - Single selection dropdown
 * - Custom styling matching design system
 * - Keyboard navigation support
 * - ControlValueAccessor for form integration
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal,
  computed,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiStore } from '@core/stores/ui.store';
import { SelectOption } from '@app-types/common';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, TranslateModule, AppMatIconComponent, SvgIconComponent],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block relative',
  },
})
export class SelectComponent<T = string> implements ControlValueAccessor {
  // Inputs
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('選択してください');
  readonly disabled = input<boolean>(false);
  readonly size = input<'default' | 'small'>('default');
  readonly width = input<string>('240px');
  readonly supportText = input<string>('');
  readonly plainStyle = input<boolean>(false);
  readonly showClear = input<boolean>(true);
  readonly dropdownStyle = signal<{ top: string; left: string; width: string; maxHeight: string }>({
    top: '0px',
    left: '0px',
    width: '0px',
    maxHeight: '240px',
  });
  readonly classNameInputSelect = input<string>('');

  // Model for two-way binding
  readonly value = model<T | null>(null);

  // Outputs
  readonly selectionChange = output<T>();

  // Internal state
  readonly isOpen = signal(false);
  readonly isVisible = signal(false);

  // Computed
  readonly selectedOption = computed(() => {
    const currentValue = this.value();
    return this.options().find((opt) => opt.value === currentValue) ?? null;
  });

  readonly displayLabel = computed(() => {
    return this.selectedOption()?.label ?? this.placeholder();
  });

  // Inject dependencies
  private readonly elementRef = inject(ElementRef);
  private readonly uiStore = inject(UiStore);
  readonly isMobile = this.uiStore.isMobile;

  // ControlValueAccessor callbacks
  private onChange: (value: T | null) => void = (_: T | null) => {
    /* noop */
  };
  private onTouched: () => void = () => {
    /* noop */
  };

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.toggle();
        break;
      case 'Escape':
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) {
          this.open();
        } else {
          this.focusNextOption();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.isOpen()) {
          this.focusPreviousOption();
        }
        break;
    }
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.disabled()) return;
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxHeight = Math.max(Math.min(spaceBelow, 300), 120);
    this.dropdownStyle.set({
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
    });
    if (this.size() === 'small') {
      this.dropdownStyle.update((style) => ({ ...style, width: this.width() }));
    }
    this.isVisible.set(true);
    requestAnimationFrame(() => this.isOpen.set(true));
  }

  private getClippingAncestorBottom(): number {
    let el = this.elementRef.nativeElement.parentElement as HTMLElement | null;
    while (el && el !== document.body) {
      const { overflow, overflowY } = window.getComputedStyle(el);
      if (/auto|scroll|hidden/.test(overflow) || /auto|scroll|hidden/.test(overflowY)) {
        return el.getBoundingClientRect().bottom;
      }
      el = el.parentElement;
    }
    return window.innerHeight;
  }

  close(): void {
    this.isOpen.set(false);
    this.onTouched();
    const delay = this.isMobile() ? 300 : 0;
    setTimeout(() => this.isVisible.set(false), delay);
  }

  clearValue(): void {
    this.value.set(null);
    this.onChange(null);
  }

  selectOption(option: SelectOption<T>): void {
    if (option.disabled) return;

    this.value.set(option.value);
    this.onChange(option.value);
    this.selectionChange.emit(option.value);
    this.close();
  }

  isSelected(option: SelectOption<T>): boolean {
    return this.value() === option.value;
  }

  // ControlValueAccessor implementation
  writeValue(value: T | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(_isDisabled: boolean): void {
    // Disabled state is handled by input signal
  }

  private focusNextOption(): void {
    const opts = this.options();
    const currentIndex = opts.findIndex((opt) => opt.value === this.value());
    const nextIndex = currentIndex < opts.length - 1 ? currentIndex + 1 : 0;
    const nextOption = opts[nextIndex];
    if (nextOption && !nextOption.disabled) {
      this.selectOption(nextOption);
    }
  }

  private focusPreviousOption(): void {
    const opts = this.options();
    const currentIndex = opts.findIndex((opt) => opt.value === this.value());
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : opts.length - 1;
    const prevOption = opts[prevIndex];
    if (prevOption && !prevOption.disabled) {
      this.selectOption(prevOption);
    }
  }
}
