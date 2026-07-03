import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import type { SelectOption } from '@app-types/common';
import { UiStore } from '@core/stores/ui.store';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';

type PanelSize = 'default' | 'big' | 'full';
type FilledState = 'active' | 'inputed';

@Component({
  selector: 'app-combobox-multi',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent, SvgIconComponent],
  templateUrl: './combobox-multi.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ComboboxMultiComponent),
      multi: true,
    },
  ],
  host: {
    class: 'block',
  },
})
export class ComboboxMultiComponent<T = string> implements ControlValueAccessor {
  readonly id = input.required<string>();
  readonly name = input.required<string>();

  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input<string>('選択してください');

  readonly disabled = input<boolean>(false);
  readonly required = input<boolean>(false);
  readonly error = input<boolean>(false);

  readonly label = input<string | undefined>(undefined);
  readonly badgeText = input<string | undefined>(undefined);
  readonly errorMessage = input<string | undefined>(undefined);
  readonly supportText = input<string | undefined>(undefined);

  readonly searchHint = input<string>('');
  readonly emptyMessage = input<string>('表示するデータがありません');
  readonly filled = input<FilledState | undefined>(undefined);
  readonly panelSize = input<PanelSize>('default');

  readonly value = model<T[]>([]);
  readonly commit = output<T[]>();

  readonly isOpen = signal(false);
  readonly isVisible = signal(false);

  readonly query = signal('');
  readonly staging = signal<T[] | null>(null);

  readonly effectiveValue = computed(() => this.staging() ?? this.value());
  readonly hasValue = computed(() => this.effectiveValue().length > 0);
  readonly selectedOptions = computed(() => {
    const selected = this.effectiveValue();
    return this.options().filter((opt) => selected.includes(opt.value));
  });

  readonly filteredOptions = computed(() => {
    const q = this.query().trim().toLowerCase();
    const opts = this.options();
    if (!q) return opts;
    return opts.filter((opt) => {
      const label = String(opt.label ?? '').toLowerCase();
      const desc = String(opt.description ?? '').toLowerCase();
      const cat = String(opt.category ?? '').toLowerCase();
      return label.includes(q) || desc.includes(q) || cat.includes(q);
    });
  });

  readonly allSelected = computed(() => {
    const enabled = this.filteredOptions()
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    if (enabled.length === 0) return false;
    const current = this.effectiveValue();
    return enabled.every((v) => current.includes(v));
  });
  readonly someSelected = computed(() => {
    const enabled = this.filteredOptions()
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    if (enabled.length === 0) return false;
    const current = this.effectiveValue();
    const count = enabled.filter((v) => current.includes(v)).length;
    return count > 0 && count < enabled.length;
  });

  readonly isMobile = inject(UiStore).isMobile;
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  private readonly chipsRowRef = viewChild<ElementRef<HTMLElement>>('chipsRow');
  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('pcInput');
  private readonly spInputRef = viewChild<ElementRef<HTMLInputElement>>('spInput');
  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  readonly listStyle = signal<{
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    width?: string;
    maxHeight?: string;
    opacity?: string;
  }>({});

  readonly openUpward = signal(false);
  readonly hiddenChipCount = signal(0);

  private onChange: (value: T[]) => void = () => {
    /* noop */
  };
  private onTouched: () => void = () => {
    /* noop */
  };

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const vals = this.effectiveValue();
      untracked(() => {
        if (open) {
          this.hiddenChipCount.set(0);
        } else {
          queueMicrotask(() => this.recalcChipOverflow(vals));
        }
      });
    });

    effect(() => {
      if (!this.isOpen() || this.isMobile()) return;
      // Wait until the dropdown is actually rendered before positioning.
      this.schedulePositionList();
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.cancel();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.isOpen() && !this.isMobile()) this.positionList();
    if (!this.isOpen()) this.recalcChipOverflow(this.effectiveValue());
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isOpen() || this.isMobile()) return;
    this.positionList();
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    if (event.key === 'Escape') {
      this.cancel();
      return;
    }
  }

  onPcInputFocus(): void {
    if (this.disabled()) return;
    if (!this.isOpen()) this.open();
  }

  onPcInputBlur(): void {
    if (!this.isOpen()) return;
    queueMicrotask(() => {
      const input = this.inputRef()?.nativeElement;
      if (!input) return;
      if (document.activeElement === input) return;
      this.recalcChipOverflow(this.effectiveValue());
    });
  }

  onSpInputFocus(): void {
    this.hiddenChipCount.set(0);
  }

  onSpInputBlur(): void {
    queueMicrotask(() => {
      const input = this.spInputRef()?.nativeElement;
      if (!input) return;
      if (document.activeElement === input) return;
      this.recalcChipOverflow(this.effectiveValue());
    });
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) this.cancel();
    else this.open();
  }

  open(): void {
    if (this.disabled()) return;
    this.staging.set([...this.value()]);
    this.query.set('');
    this.listStyle.set({ opacity: '0' });
    this.isVisible.set(true);
    this.isOpen.set(true);
    queueMicrotask(() => {
      this.schedulePositionList();
      if (this.isMobile()) {
        this.spInputRef()?.nativeElement.focus();
      } else {
        this.inputRef()?.nativeElement.focus();
      }
    });
  }

  cancel(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.isVisible.set(false);
    this.query.set('');
    this.staging.set(null);
    this.onTouched();
    queueMicrotask(() => this.recalcChipOverflow(this.value()));
  }

  confirm(): void {
    if (!this.isOpen()) return;
    const next = this.effectiveValue();
    this.isOpen.set(false);
    this.isVisible.set(false);
    this.query.set('');
    this.staging.set(null);

    this.value.set(next);
    this.onTouched();
    this.onChange(next);
    this.commit.emit(next);
    queueMicrotask(() => this.recalcChipOverflow(next));
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  onQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.onQueryChange(target?.value ?? '');
  }

  isSelected(option: SelectOption<T>): boolean {
    return this.effectiveValue().includes(option.value);
  }

  toggleOption(option: SelectOption<T>): void {
    if (option.disabled) return;
    const current = this.effectiveValue();
    const next = this.isSelected(option)
      ? current.filter((v) => v !== option.value)
      : [...current, option.value];
    this.staging.set(next);
    if (!this.isMobile()) this.inputRef()?.nativeElement.focus();
  }

  toggleAll(): void {
    const enabledVisible = this.filteredOptions()
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    const current = this.effectiveValue();
    const allSel = enabledVisible.length > 0 && enabledVisible.every((v) => current.includes(v));
    const next = allSel
      ? current.filter((v) => !enabledVisible.includes(v))
      : Array.from(new Set([...current, ...enabledVisible]));
    this.staging.set(next);
    if (!this.isMobile()) this.inputRef()?.nativeElement.focus();
  }

  removeChip(event: MouseEvent, optionValue: T): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.isOpen()) {
      const next = this.effectiveValue().filter((v) => v !== optionValue);
      this.staging.set(next);
      if (!this.isMobile()) this.inputRef()?.nativeElement.focus();
      return;
    }

    const next = this.value().filter((v) => v !== optionValue);
    this.value.set(next);
    this.onTouched();
    this.onChange(next);
    this.commit.emit(next);
    queueMicrotask(() => this.recalcChipOverflow(next));
  }

  writeValue(value: T[]): void {
    this.value.set(value ?? []);
    queueMicrotask(() => this.recalcChipOverflow(value ?? []));
  }

  registerOnChange(fn: (value: T[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(_isDisabled: boolean): void {
    // Disabled state is controlled by the input signal
  }

  private positionList(): void {
    if (this.isMobile()) {
      // Mobile uses full-screen overlay, just ensure visible
      this.listStyle.set({ opacity: '1' });
      return;
    }
    const list = this.listRef()?.nativeElement;
    const trigger = this.elementRef.nativeElement.querySelector(
      '[data-cmulti-trigger]',
    ) as HTMLElement | null;
    if (!list || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const GAP = 4;
    const MARGIN = 8;

    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;

    let width = 240;
    if (this.panelSize() === 'full') width = rect.width;
    else if (this.panelSize() === 'big') width = 280;

    let left = rect.left;
    if (left + width > window.innerWidth - MARGIN) left = window.innerWidth - width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    this.openUpward.set(openUpward);
    const maxHeight = Math.max(openUpward ? spaceAbove : spaceBelow, 120);

    this.listStyle.set(
      openUpward
        ? {
            top: '',
            bottom: `${window.innerHeight - rect.top + GAP}px`,
            left: `${left}px`,
            right: 'auto',
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
            opacity: '1',
          }
        : {
            top: `${rect.bottom}px`,
            bottom: '',
            left: `${left}px`,
            right: 'auto',
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
            opacity: '1',
          },
    );

    list.style.position = 'fixed';
    list.style.right = 'auto';
  }

  private schedulePositionList(): void {
    // rAF twice: first for DOM paint, second for layout stabilization in dialogs.
    requestAnimationFrame(() => requestAnimationFrame(() => this.positionList()));
  }

  private recalcChipOverflow(_vals: T[]): void {
    const row = this.chipsRowRef()?.nativeElement;
    const input = this.inputRef()?.nativeElement;
    if (!row) return;

    // Reset any prior hiding (chips are plain elements in this component)
    row.querySelectorAll<HTMLElement>('[data-chip-el]').forEach((el) => {
      el.removeAttribute('hidden');
    });
    row.querySelectorAll<HTMLElement>('[data-overflow-badge-el]').forEach((el) => el.remove());

    if (this.isOpen()) {
      this.hiddenChipCount.set(0);
      if (input) input.removeAttribute('hidden');
      return;
    }

    const chips = Array.from(row.querySelectorAll<HTMLElement>('[data-chip-el]'));
    if (chips.length === 0) {
      this.hiddenChipCount.set(0);
      if (input) input.removeAttribute('hidden');
      return;
    }

    if (!row.clientWidth) return; // hidden container: skip measurement

    if (input) input.setAttribute('hidden', '');

    const firstTop = chips[0].offsetTop;
    let hiddenCount = 0;
    for (let i = 1; i < chips.length; i++) {
      if (chips[i].offsetTop > firstTop) {
        chips[i].setAttribute('hidden', '');
        hiddenCount++;
      }
    }

    if (hiddenCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'combobox-overflow-badge';
      badge.textContent = `+${hiddenCount}`;
      badge.setAttribute('data-overflow-badge-el', '');
      row.insertBefore(badge, input ?? null);

      // If badge itself wrapped, hide one more chip at a time until it fits.
      while (hiddenCount < chips.length && badge.offsetTop > firstTop) {
        let lastVisibleIdx = -1;
        for (let i = chips.length - 1; i >= 0; i--) {
          if (!chips[i].hasAttribute('hidden')) {
            lastVisibleIdx = i;
            break;
          }
        }
        if (lastVisibleIdx <= 0) break;
        chips[lastVisibleIdx].setAttribute('hidden', '');
        hiddenCount++;
        badge.textContent = `+${hiddenCount}`;
      }
    }

    this.hiddenChipCount.set(hiddenCount);
  }
}
