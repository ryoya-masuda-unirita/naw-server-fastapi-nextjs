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
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { UiStore } from '@core/stores/ui.store';
import { SelectOption } from '@app-types/common';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { ButtonComponent } from '@shared/components/button/button.component';

@Component({
  selector: 'app-chunk-select',
  standalone: true,
  imports: [CommonModule, TranslateModule, SvgIconComponent, ButtonComponent, FormsModule],
  templateUrl: './chunk-select.component.html',
  styleUrl: './chunk-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ChunkSelectComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block relative',
  },
})
export class ChunkSelectComponent implements ControlValueAccessor {
  // Inputs
  readonly options = input<SelectOption<string>[]>([
    { value: 'large', label: '大' },
    { value: 'medium', label: '中' },
    { value: 'small', label: '小' },
  ]);
  readonly placeholder = input<string>('チャンク分割を選択');
  readonly disabled = input<boolean>(false);
  readonly size = input<'default' | 'small' | 'lg'>('small');
  readonly plainStyle = input<boolean>(true);
  readonly error = input<string>('');

  // Model for two-way binding
  readonly value = model<string | null>(null);

  // Outputs
  readonly selectionChange = output<string>();

  // Internal state
  readonly isOpen = signal(false);
  readonly isVisible = signal(false);
  readonly view = signal<'list' | 'numeric'>('list');
  readonly numericValue = signal<number | null>(null);

  // Position signals
  readonly listPanelStyle = signal<any>({});
  readonly numericPanelStyle = signal<any>({});

  // Computed
  readonly selectedOption = computed(() => {
    const currentValue = this.value();
    const opt = this.options().find((opt) => opt.value === currentValue);
    if (opt) return opt;
    if (currentValue && !isNaN(Number(currentValue))) {
      return { value: currentValue, label: currentValue };
    }
    return null;
  });

  readonly displayLabel = computed(() => {
    const selected = this.selectedOption();
    if (selected) {
      return selected.label;
    }
    return this.placeholder();
  });

  // Inject dependencies
  private readonly elementRef = inject(ElementRef);
  private readonly uiStore = inject(UiStore);
  readonly isMobile = this.uiStore.isMobile;

  // ControlValueAccessor callbacks
  private onChange: (value: string | null) => void = (_: string | null) => {
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

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onWindowChange(): void {
    if (this.isOpen()) {
      this.updatePositions();
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
    this.view.set('list');
    this.isVisible.set(true);
    this.updatePositions();
    requestAnimationFrame(() => this.isOpen.set(true));
  }

  updatePositions(): void {
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    const panelWidth = 240;
    const spacing = 4;

    // List panel position
    let listLeft = rect.left;
    if (listLeft + panelWidth > window.innerWidth - 8) {
      listLeft = window.innerWidth - panelWidth - 8;
    }

    this.listPanelStyle.set({
      position: 'fixed',
      top: `${rect.bottom + spacing}px`,
      left: `${listLeft}px`,
      width: `${panelWidth}px`,
      zIndex: 9999,
    });

    // Numeric panel position (side-by-side on PC)
    if (!this.isMobile()) {
      const optionHeight = 36;
      const paddingTop = 8;
      const numericOptionIndex = 3;
      const topOffset = paddingTop + numericOptionIndex * optionHeight;

      let numericLeft = listLeft + panelWidth + spacing;
      if (numericLeft + panelWidth > window.innerWidth - 8) {
        numericLeft = listLeft - panelWidth - spacing;
      }

      this.numericPanelStyle.set({
        position: 'fixed',
        top: `${rect.bottom + spacing + topOffset}px`,
        left: `${numericLeft}px`,
        width: `${panelWidth}px`,
        zIndex: 9999,
      });
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.onTouched();
    const delay = this.isMobile() ? 300 : 0;
    setTimeout(() => this.isVisible.set(false), delay);
  }

  clear(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.value.set(null);
    this.onChange(null);
    this.selectionChange.emit('');
    if (this.isOpen()) this.close();
  }

  selectOption(option: SelectOption<string>): void {
    if (option.disabled) return;

    this.value.set(option.value);
    this.onChange(option.value);
    this.selectionChange.emit(option.value);
    this.close();
  }

  openNumericView(): void {
    const current = this.value();
    if (current && !isNaN(Number(current))) {
      this.numericValue.set(Number(current));
    } else {
      this.numericValue.set(null);
    }
    this.view.set('numeric');
  }

  confirmNumeric(): void {
    const val = this.numericValue();
    if (val !== null && val > 0) {
      const stringVal = val.toString();
      this.value.set(stringVal);
      this.onChange(stringVal);
      this.selectionChange.emit(stringVal);
      this.close();
    }
  }

  cancelNumeric(): void {
    this.view.set('list');
  }

  isSelected(option: SelectOption<string>): boolean {
    return this.value() === option.value;
  }

  // ControlValueAccessor implementation
  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
}
