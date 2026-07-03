import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { UiStore } from '@core/stores/ui.store';

export interface PeriodOption {
  value: string;
  label: string;
}

export interface PeriodRange {
  from: string;
  to: string;
}

export interface PeriodChange {
  value: string;
  range: PeriodRange | null;
}

type ViewName = 'main' | 'range' | 'calendar';
type RangeTarget = 'from' | 'to';

interface CalendarCell {
  day: number;
  date: string | null;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const CUSTOM_VALUE = 'custom';

@Component({
  selector: 'app-period-filter',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonComponent, SvgIconComponent],
  templateUrl: './period-filter.component.html',
  styleUrl: './period-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block relative' },
})
export class PeriodFilterComponent {
  readonly options = input<PeriodOption[]>([
    { value: '', label: 'COMMON.PERIOD_FILTER.ALL_PERIODS' },
    { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
    { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
    { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
  ]);
  readonly placeholder = input<string>('COMMON.PERIOD_FILTER.ALL_PERIODS');
  readonly size = input<'default' | 'small'>('default');
  readonly disabled = input<boolean>(false);
  readonly allowCustom = input<boolean>(true);

  readonly value = model<string | null>(null);
  readonly range = model<PeriodRange | null>(null);

  readonly selectionChange = output<PeriodChange>();

  readonly isOpen = signal(false);
  readonly view = signal<ViewName>('main');
  readonly tempFrom = signal('');
  readonly tempTo = signal('');
  readonly calendarTarget = signal<RangeTarget>('from');

  private readonly today = new Date();
  readonly dpYear = signal(this.today.getFullYear());
  readonly dpMonth = signal(this.today.getMonth());
  readonly dpSelectedDate = signal<string | null>(null);

  private readonly elementRef = inject(ElementRef);
  private readonly uiStore = inject(UiStore);
  private readonly translate = inject(TranslateService);
  readonly isMobile = this.uiStore.isMobile;

  readonly weekdayKeys = [
    'COMMON.PERIOD_FILTER.WEEKDAYS.SUN',
    'COMMON.PERIOD_FILTER.WEEKDAYS.MON',
    'COMMON.PERIOD_FILTER.WEEKDAYS.TUE',
    'COMMON.PERIOD_FILTER.WEEKDAYS.WED',
    'COMMON.PERIOD_FILTER.WEEKDAYS.THU',
    'COMMON.PERIOD_FILTER.WEEKDAYS.FRI',
    'COMMON.PERIOD_FILTER.WEEKDAYS.SAT',
  ];

  readonly hasSelection = computed(() => {
    const v = this.value();
    return !!v || (v === CUSTOM_VALUE && !!this.range());
  });

  readonly selectedLabel = computed(() => {
    const v = this.value();
    const r = this.range();
    if (v === CUSTOM_VALUE && r) {
      if (r.from && r.to) return `${r.from} 〜 ${r.to}`;
      if (r.from) {
        return `${r.from} ${this.translate.instant('COMMON.PERIOD_FILTER.FROM_LABEL')}`;
      }
      if (r.to) {
        return `${r.to} ${this.translate.instant('COMMON.PERIOD_FILTER.UNTIL_LABEL')}`;
      }
    }
    const opt = this.options().find((o) => o.value === v);
    if (!opt) return this.translate.instant(this.placeholder());
    return this.translate.instant(opt.label);
  });

  readonly monthLabel = computed(() => {
    const year = this.dpYear();
    const month = this.dpMonth() + 1;
    return this.translate.instant('COMMON.PERIOD_FILTER.MONTH_FORMAT', {
      year,
      month,
    });
  });

  readonly calendarRows = computed<CalendarCell[][]>(() => {
    const year = this.dpYear();
    const month = this.dpMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = this.formatDate(this.today);
    const selected = this.dpSelectedDate();

    const rows: CalendarCell[][] = [];
    let day = 1;
    let nextDay = 1;
    let done = false;

    for (let r = 0; r < 6; r++) {
      const row: CalendarCell[] = [];
      for (let c = 0; c < 7; c++) {
        const cellNum = r * 7 + c;
        if (cellNum < firstDow) {
          row.push({ day: 0, date: null, inMonth: false, isToday: false, isSelected: false });
        } else if (day > daysInMonth) {
          row.push({
            day: nextDay++,
            date: null,
            inMonth: false,
            isToday: false,
            isSelected: false,
          });
        } else {
          const dateStr = this.formatDate(new Date(year, month, day));
          row.push({
            day,
            date: dateStr,
            inMonth: true,
            isToday: dateStr === todayStr,
            isSelected: dateStr === selected,
          });
          day++;
        }
      }
      rows.push(row);
      if (done) break;
      if (day > daysInMonth) done = true;
    }
    return rows;
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) this.close();
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(): void {
    if (this.disabled()) return;
    this.view.set('main');
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.view.set('main');
  }

  selectPreset(option: PeriodOption): void {
    this.value.set(option.value);
    this.range.set(null);
    this.selectionChange.emit({ value: option.value, range: null });
    this.close();
  }

  openRangeView(): void {
    const r = this.range();
    this.tempFrom.set(r?.from ?? '');
    this.tempTo.set(r?.to ?? '');
    this.view.set('range');
  }

  openCalendar(target: RangeTarget): void {
    this.calendarTarget.set(target);
    const existing = target === 'from' ? this.tempFrom() : this.tempTo();
    if (existing) {
      const [y, m] = existing.split('/').map(Number);
      this.dpYear.set(y);
      this.dpMonth.set(m - 1);
      this.dpSelectedDate.set(existing);
    } else {
      this.dpYear.set(this.today.getFullYear());
      this.dpMonth.set(this.today.getMonth());
      this.dpSelectedDate.set(null);
    }
    this.view.set('calendar');
  }

  backToMain(): void {
    this.view.set('main');
  }

  backToRange(): void {
    this.view.set('range');
  }

  prevMonth(): void {
    const m = this.dpMonth();
    if (m === 0) {
      this.dpMonth.set(11);
      this.dpYear.update((y) => y - 1);
    } else {
      this.dpMonth.set(m - 1);
    }
  }

  nextMonth(): void {
    const m = this.dpMonth();
    if (m === 11) {
      this.dpMonth.set(0);
      this.dpYear.update((y) => y + 1);
    } else {
      this.dpMonth.set(m + 1);
    }
  }

  selectDate(cell: CalendarCell): void {
    if (!cell.inMonth || !cell.date) return;
    this.applyDateToTarget(cell.date);
  }

  selectCalendarToday(): void {
    this.applyDateToTarget(this.formatDate(this.today));
  }

  clearRangeInput(target: RangeTarget, event: Event): void {
    event.stopPropagation();
    if (target === 'from') this.tempFrom.set('');
    else this.tempTo.set('');
  }

  cancelRange(): void {
    this.tempFrom.set('');
    this.tempTo.set('');
    this.view.set('main');
  }

  confirmRange(): void {
    const from = this.tempFrom();
    const to = this.tempTo();
    if (!from && !to) {
      this.close();
      return;
    }
    const newRange: PeriodRange = { from, to };
    this.value.set(CUSTOM_VALUE);
    this.range.set(newRange);
    this.selectionChange.emit({ value: CUSTOM_VALUE, range: newRange });
    this.close();
  }

  clearAll(event: Event): void {
    event.stopPropagation();
    this.value.set('');
    this.range.set(null);
    this.tempFrom.set('');
    this.tempTo.set('');
    this.selectionChange.emit({ value: '', range: null });
  }

  isPresetSelected(option: PeriodOption): boolean {
    return this.value() === option.value;
  }

  isCustomSelected(): boolean {
    return this.value() === CUSTOM_VALUE;
  }

  trackOption(_index: number, option: PeriodOption): string {
    return option.value;
  }

  trackRow(index: number): number {
    return index;
  }

  trackCell(index: number): number {
    return index;
  }

  private applyDateToTarget(dateStr: string): void {
    if (this.calendarTarget() === 'from') this.tempFrom.set(dateStr);
    else this.tempTo.set(dateStr);
    this.dpSelectedDate.set(dateStr);
    this.view.set('range');
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
}
