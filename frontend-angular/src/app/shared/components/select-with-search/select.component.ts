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
  effect,
  forwardRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal,
  computed,
  viewChild,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiStore } from '@core/stores/ui.store';
import { SelectOption } from '@app-types/common';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-select-with-search',
  standalone: true,
  imports: [CommonModule, TranslateModule, AppMatIconComponent, SvgIconComponent],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectWithSearchComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block relative',
  },
})
export class SelectWithSearchComponent<T = string> implements ControlValueAccessor {
  // Inputs
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('選択してください');
  readonly disabled = input<boolean>(false);
  readonly size = input<'default' | 'small'>('default');
  readonly width = input<string>('240px');
  readonly supportText = input<string>('');
  readonly dropdownStyle = signal<{ top: string; left: string; width: string; maxHeight: string }>({
    top: '0px',
    left: '0px',
    width: '0px',
    maxHeight: '240px',
  });

  // Model for two-way binding
  readonly value = model<T | null>(null);

  // Outputs
  readonly selectionChange = output<T>();

  // Internal state
  readonly isOpen = signal(false);
  /** Controls DOM presence — delayed on close to allow leave transition */
  readonly isVisible = signal(false);
  readonly isFocused = signal(false);
  readonly searchQuery = signal('');
  /** True once the user starts typing in the mobile drawer input */
  readonly isMobileSearchActive = signal(false);

  // Computed
  readonly selectedOption = computed(() => {
    const currentValue = this.value();
    return this.options().find((opt) => opt.value === currentValue) ?? null;
  });

  readonly displayLabel = computed(() => {
    return this.selectedOption()?.label ?? this.placeholder();
  });

  readonly filteredOptions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.options();
    return this.options().filter((opt) => opt.label.toLowerCase().includes(query));
  });

  // Inject dependencies
  private readonly elementRef = inject(ElementRef);
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  private readonly mobileInputEl = viewChild<ElementRef<HTMLInputElement>>('mobileInputEl');
  private readonly uiStore = inject(UiStore);
  readonly isMobile = this.uiStore.isMobile;

  constructor() {
    // Trigger input: show search query while typing, else selected label.
    // Intentionally does NOT track isVisible so that the isVisible.set(true)
    // call in open() doesn't reset el.value and interrupt the browser cursor.
    effect(() => {
      const el = this.inputEl()?.nativeElement;
      if (!el) return;
      el.value =
        this.isOpen() && this.searchQuery()
          ? this.searchQuery()
          : (this.selectedOption()?.label ?? '');
    });

    // Mobile drawer input: only set imperatively when the user hasn't started typing
    // (avoids [value] binding refilling the input after deletion)
    effect(() => {
      const mobileEl = this.mobileInputEl()?.nativeElement;
      if (mobileEl && this.isVisible() && !this.isMobileSearchActive()) {
        mobileEl.value = this.selectedOption()?.label ?? '';
      }
    });

    // Auto-focus the mobile input when the drawer opens
    effect(() => {
      if (this.isMobile() && this.isOpen()) {
        requestAnimationFrame(() => this.mobileInputEl()?.nativeElement.focus());
      }
    });
  }

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

  onWrapperClick(event: MouseEvent): void {
    if (this.disabled()) return;
    // Input clicks are handled separately by onInputClick; ignore them here
    // to avoid double-handling (open + toggle)
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    this.toggle();
  }

  onInputClick(): void {
    if (this.disabled()) return;
    // Do NOT call stopPropagation — the event must reach document so that
    // other open dropdowns (e.g. app-select) can detect an outside click and close
    if (!this.isOpen()) this.open();
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

  close(): void {
    this.isOpen.set(false);
    this.searchQuery.set('');
    this.isMobileSearchActive.set(false);
    this.onTouched();
    setTimeout(() => this.isVisible.set(false), 300);
  }

  handleSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    if (!this.isOpen()) this.open();
  }

  handleMobileSearchInput(event: Event): void {
    this.isMobileSearchActive.set(true);
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    if (!input.value) {
      this.value.set(null);
      this.onChange(null);
    }
    if (!this.isOpen()) this.open();
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.value.set(null);
    this.onChange(null);
    const inputEl = this.inputEl()?.nativeElement;
    if (inputEl) inputEl.value = '';
    const mobileInputEl = this.mobileInputEl()?.nativeElement;
    if (mobileInputEl) mobileInputEl.value = '';
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
