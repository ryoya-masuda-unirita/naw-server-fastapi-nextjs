import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { UiStore } from '@core/stores/ui.store';
import { SelectOption } from '@app-types/common';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { CheckboxComponent } from '../checkbox/checkbox.component';
import { SvgIconComponent } from '../icons/svg-icon.component';

@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    AppMatIconComponent,
    ButtonComponent,
    CheckboxComponent,
    SvgIconComponent,
  ],
  templateUrl: './multi-select.component.html',
  styleUrl: './multi-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block relative',
  },
})
export class MultiSelectComponent<T = string> implements ControlValueAccessor {
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('選択してください');
  readonly disabled = input<boolean>(false);
  readonly size = input<'default' | 'small'>('default');
  readonly width = input<string>('240px');
  readonly supportText = input<string>('');
  /** Force dropdown placement below the trigger (desktop only). */
  readonly forceBelow = input<boolean>(false);

  readonly value = model<T[]>([]);
  readonly selectionChange = output<T[]>();

  readonly isOpen = signal(false);
  readonly isVisible = signal(false);
  readonly dropdownMaxHeight = signal<string>('300px');
  /** True when there's more room above the trigger than below it. */
  readonly placeAbove = signal(false);

  private snapshot: T[] | null = null;

  readonly selectedOptions = computed(() => {
    const selected = this.value();
    return this.options().filter((opt) => selected.includes(opt.value));
  });

  readonly hasValue = computed(() => this.value().length > 0);

  readonly allSelected = computed(() => {
    const enabled = this.options().filter((o) => !o.disabled);
    return enabled.length > 0 && enabled.every((o) => this.value().includes(o.value));
  });

  readonly someSelected = computed(() => this.hasValue() && !this.allSelected());

  private readonly elementRef = inject(ElementRef);
  private readonly uiStore = inject(UiStore);
  readonly isMobile = this.uiStore.isMobile;

  private onChange: (value: T[]) => void = () => {
    /* noop */
  };
  private onTouched: () => void = () => {
    /* noop */
  };

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.cancel();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.isOpen()) this.open();
        break;
      case 'Escape':
        this.cancel();
        break;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.isOpen() && !this.isMobile()) {
      this.updateDropdownLayout();
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (this.isOpen() && !this.isMobile()) {
      this.updateDropdownLayout();
    }
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) {
      this.cancel();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.disabled()) return;
    this.snapshot = [...this.value()];
    this.isVisible.set(true);
    requestAnimationFrame(() => {
      this.updateDropdownLayout();
      this.isOpen.set(true);
    });
  }

  confirm(): void {
    if (!this.isOpen()) return;
    this.snapshot = null;
    this.isOpen.set(false);
    this.onTouched();
    this.onChange(this.value());
    this.selectionChange.emit(this.value());
    const delay = this.isMobile() ? 300 : 0;
    setTimeout(() => this.isVisible.set(false), delay);
  }

  cancel(): void {
    if (!this.isOpen()) return;
    if (this.snapshot !== null) {
      this.value.set(this.snapshot);
      // Do not emit – parent state was never updated during open, snapshot matches it.
    }
    this.snapshot = null;
    this.isOpen.set(false);
    this.onTouched();
    const delay = this.isMobile() ? 300 : 0;
    setTimeout(() => this.isVisible.set(false), delay);
  }

  isSelected(option: SelectOption<T>): boolean {
    return this.value().includes(option.value);
  }

  toggleOption(option: SelectOption<T>): void {
    if (option.disabled) return;
    const current = this.value();
    const next = this.isSelected(option)
      ? current.filter((v) => v !== option.value)
      : [...current, option.value];
    this.value.set(next);
    this.scheduleUpdateDropdownLayout();
    // Emit only on confirm(); interim toggles are internal until confirmed.
  }

  toggleAll(): void {
    const enabled = this.options().filter((o) => !o.disabled);
    const next = this.allSelected() ? [] : enabled.map((o) => o.value);
    this.value.set(next);
    this.scheduleUpdateDropdownLayout();
    // Emit only on confirm(); interim toggles are internal until confirmed.
  }

  removeChip(event: MouseEvent, optionValue: T): void {
    event.stopPropagation();
    const next = this.value().filter((v) => v !== optionValue);
    this.value.set(next);
    this.onChange(next);
    this.selectionChange.emit(next);
  }

  writeValue(value: T[]): void {
    this.value.set(value ?? []);
  }

  registerOnChange(fn: (value: T[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(_isDisabled: boolean): void {
    // Disabled state handled by input signal
  }

  private updateDropdownLayout(): void {
    if (this.isMobile()) return;

    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const { top: containerTop, bottom: containerBottom } = this.getClippingAncestorBounds();
    const spaceBelow = containerBottom - rect.bottom - 16;
    const spaceAbove = rect.top - containerTop - 16;
    // Open above when there's clearly more room there (e.g. trigger near
    // the bottom of a dialog). Falls back to "below" by default.
    const placeAbove = !this.forceBelow() && spaceAbove > spaceBelow && spaceBelow < 240;
    this.placeAbove.set(placeAbove);
    const available = placeAbove ? spaceAbove : spaceBelow;
    this.dropdownMaxHeight.set(`${Math.max(available, 160)}px`);
  }

  private scheduleUpdateDropdownLayout(): void {
    if (!this.isOpen() || this.isMobile()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => this.updateDropdownLayout()));
  }

  private getClippingAncestorBounds(): { top: number; bottom: number } {
    let el = this.elementRef.nativeElement.parentElement as HTMLElement | null;
    while (el && el !== document.body) {
      const { overflow, overflowY } = window.getComputedStyle(el);
      if (/auto|scroll|hidden/.test(overflow) || /auto|scroll|hidden/.test(overflowY)) {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }
      el = el.parentElement;
    }
    return { top: 0, bottom: window.innerHeight };
  }
}
