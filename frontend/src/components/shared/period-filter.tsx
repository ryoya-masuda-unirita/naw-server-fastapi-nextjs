import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './period-filter.css';
import { Button } from './button';
import { cx } from './class-names';
import type { PeriodChange, PeriodOption, PeriodRange } from './period-filter-utils';
import { SvgIcon } from './icons/svg-icon';
import { useIsMobile } from './use-is-mobile';

export type { PeriodChange, PeriodOption, PeriodRange } from './period-filter-utils';

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

const DEFAULT_OPTIONS: PeriodOption[] = [
  { value: '', label: 'COMMON.PERIOD_FILTER.ALL_PERIODS' },
  { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
  { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
  { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
];

const WEEKDAY_KEYS = [
  'COMMON.PERIOD_FILTER.WEEKDAYS.SUN',
  'COMMON.PERIOD_FILTER.WEEKDAYS.MON',
  'COMMON.PERIOD_FILTER.WEEKDAYS.TUE',
  'COMMON.PERIOD_FILTER.WEEKDAYS.WED',
  'COMMON.PERIOD_FILTER.WEEKDAYS.THU',
  'COMMON.PERIOD_FILTER.WEEKDAYS.FRI',
  'COMMON.PERIOD_FILTER.WEEKDAYS.SAT',
];

const CALENDAR_MAX_ROWS = 6;
const DAYS_IN_WEEK = 7;

/** カレンダーの入力値は `YYYY/MM/DD`（移植元の formatDate と同じ形式） */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 移植元 calendarRows。月末の行を埋め終えたら、その次の行（翌月の日付だけの行）まで出して止める */
function buildCalendarRows(
  year: number,
  month: number,
  todayStr: string,
  selected: string | null,
): CalendarCell[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows: CalendarCell[][] = [];
  let day = 1;
  let nextDay = 1;
  let done = false;
  for (let r = 0; r < CALENDAR_MAX_ROWS; r++) {
    const row: CalendarCell[] = [];
    for (let c = 0; c < DAYS_IN_WEEK; c++) {
      const cellNum = r * DAYS_IN_WEEK + c;
      if (cellNum < firstDow) {
        row.push({ day: 0, date: null, inMonth: false, isToday: false, isSelected: false });
      } else if (day > daysInMonth) {
        row.push({ day: nextDay++, date: null, inMonth: false, isToday: false, isSelected: false });
      } else {
        const dateStr = formatDate(new Date(year, month, day));
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
}

interface PeriodFilterProps {
  options?: PeriodOption[];
  /** i18n キー */
  placeholder?: string;
  size?: 'default' | 'small';
  disabled?: boolean;
  /** 「期間を指定」（カレンダーでの範囲指定）を出す */
  allowCustom?: boolean;
  /**
   * テスト用の安定セレクタの接頭辞。
   * `${prefix}-trigger` / `-option` / `-custom` / `-from-input` / `-to-input` / `-apply-button` / `-calendar-today` を付ける。
   */
  testidPrefix?: string | null;
  /** 選択中のプリセットのキー（期間指定は 'custom'） */
  value?: string | null;
  range?: PeriodRange | null;
  onValueChange?: (value: string) => void;
  onRangeChange?: (range: PeriodRange | null) => void;
  onSelectionChange?: (change: PeriodChange) => void;
  className?: string;
}

/** 移植元 `<app-period-filter>`（shared/components/filter/period-filter） */
export function PeriodFilter({
  options = DEFAULT_OPTIONS,
  placeholder = 'COMMON.PERIOD_FILTER.ALL_PERIODS',
  size = 'default',
  disabled = false,
  allowCustom = true,
  testidPrefix = null,
  value = null,
  range = null,
  onValueChange,
  onRangeChange,
  onSelectionChange,
  className,
}: PeriodFilterProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  // 移植元はコンポーネント生成時の日付を「今日」として持ち続ける
  const [today] = useState(() => new Date());

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ViewName>('main');
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const [calendarTarget, setCalendarTarget] = useState<RangeTarget>('from');
  const [dpYear, setDpYear] = useState(() => today.getFullYear());
  const [dpMonth, setDpMonth] = useState(() => today.getMonth());
  const [dpSelectedDate, setDpSelectedDate] = useState<string | null>(null);

  const testid = (suffix: string) => (testidPrefix ? `${testidPrefix}-${suffix}` : undefined);

  const close = () => {
    setIsOpen(false);
    setView('main');
  };

  // 移植元の @HostListener('document:click')。部品の外をクリックしたら閉じる
  useEffect(() => {
    const onDocumentClick = (event: globalThis.MouseEvent) => {
      if (hostRef.current && !hostRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setView('main');
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  const hasSelection = !!value || (value === CUSTOM_VALUE && !!range);

  const selectedLabel = (() => {
    if (value === CUSTOM_VALUE && range) {
      if (range.from && range.to) return `${range.from} 〜 ${range.to}`;
      if (range.from) return `${range.from} ${t('COMMON.PERIOD_FILTER.FROM_LABEL')}`;
      if (range.to) return `${range.to} ${t('COMMON.PERIOD_FILTER.UNTIL_LABEL')}`;
    }
    const opt = options.find((o) => o.value === value);
    if (!opt) return t(placeholder);
    return t(opt.label);
  })();

  const monthLabel = t('COMMON.PERIOD_FILTER.MONTH_FORMAT', { year: dpYear, month: dpMonth + 1 });
  const calendarRows = buildCalendarRows(dpYear, dpMonth, formatDate(today), dpSelectedDate);

  const open = () => {
    if (disabled) return;
    setView('main');
    setIsOpen(true);
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) close();
    else open();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && isOpen) close();
  };

  const selectPreset = (option: PeriodOption) => {
    onValueChange?.(option.value);
    onRangeChange?.(null);
    onSelectionChange?.({ value: option.value, range: null });
    close();
  };

  const openRangeView = () => {
    setTempFrom(range?.from ?? '');
    setTempTo(range?.to ?? '');
    setView('range');
  };

  const openCalendar = (target: RangeTarget) => {
    setCalendarTarget(target);
    const existing = target === 'from' ? tempFrom : tempTo;
    if (existing) {
      const [y, m] = existing.split('/').map(Number);
      setDpYear(y);
      setDpMonth(m - 1);
      setDpSelectedDate(existing);
    } else {
      setDpYear(today.getFullYear());
      setDpMonth(today.getMonth());
      setDpSelectedDate(null);
    }
    setView('calendar');
  };

  const prevMonth = () => {
    if (dpMonth === 0) {
      setDpMonth(11);
      setDpYear((y) => y - 1);
    } else {
      setDpMonth(dpMonth - 1);
    }
  };

  const nextMonth = () => {
    if (dpMonth === 11) {
      setDpMonth(0);
      setDpYear((y) => y + 1);
    } else {
      setDpMonth(dpMonth + 1);
    }
  };

  const applyDateToTarget = (dateStr: string) => {
    if (calendarTarget === 'from') setTempFrom(dateStr);
    else setTempTo(dateStr);
    setDpSelectedDate(dateStr);
    setView('range');
  };

  const selectDate = (cell: CalendarCell) => {
    if (!cell.inMonth || !cell.date) return;
    applyDateToTarget(cell.date);
  };

  const clearRangeInput = (target: RangeTarget, event: MouseEvent) => {
    event.stopPropagation();
    if (target === 'from') setTempFrom('');
    else setTempTo('');
  };

  const cancelRange = () => {
    setTempFrom('');
    setTempTo('');
    setView('main');
  };

  const confirmRange = () => {
    if (!tempFrom && !tempTo) {
      close();
      return;
    }
    const newRange: PeriodRange = { from: tempFrom, to: tempTo };
    onValueChange?.(CUSTOM_VALUE);
    onRangeChange?.(newRange);
    onSelectionChange?.({ value: CUSTOM_VALUE, range: newRange });
    close();
  };

  const clearAll = (event: MouseEvent) => {
    event.stopPropagation();
    onValueChange?.('');
    onRangeChange?.(null);
    setTempFrom('');
    setTempTo('');
    onSelectionChange?.({ value: '', range: null });
  };

  const isCustomSelected = value === CUSTOM_VALUE;

  const mainView = (
    <div className="flex flex-col py-2" role="listbox">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className="dl-option"
            data-selected={selected ? 'true' : undefined}
            data-testid={testid('option')}
            role="option"
            aria-selected={selected}
            onClick={() => selectPreset(option)}
          >
            <span className="dl-option__check" aria-hidden="true">
              <SvgIcon name="newCheck" className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0 truncate">{t(option.label)}</span>
          </button>
        );
      })}

      {allowCustom && (
        <button
          type="button"
          className="dl-option border-t border-border-weak"
          data-selected={isCustomSelected || (!isMobile && view !== 'main') ? 'true' : undefined}
          data-testid={testid('custom')}
          onClick={openRangeView}
        >
          <span className="dl-option__check" aria-hidden="true">
            <SvgIcon name="newCheck" className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0 truncate">{t('COMMON.PERIOD_FILTER.SPECIFY_PERIOD')}</span>
          <SvgIcon name="arrowRight" className="w-5 h-5 text-text-weak" />
        </button>
      )}
    </div>
  );

  const renderRangeInput = (target: RangeTarget) => {
    const inputValue = target === 'from' ? tempFrom : tempTo;
    return (
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            readOnly
            className="w-full h-10 pl-3 pr-9 rounded-lg border border-border-strong bg-white text-sm cursor-pointer focus:outline-none focus:border-brand-primary"
            value={inputValue}
            data-testid={testid(target === 'from' ? 'from-input' : 'to-input')}
            placeholder={t('COMMON.PERIOD_FILTER.DATE_PLACEHOLDER')}
            onClick={() => openCalendar(target)}
          />
          {inputValue && (
            <button
              type="button"
              className="absolute top-1/2 -translate-y-1/2 right-9 flex items-center justify-center h-4 w-4 cursor-pointer text-white bg-text-default rounded-full"
              onClick={(event) => clearRangeInput(target, event)}
            >
              <SvgIcon name="close" className="w-3 h-3" />
            </button>
          )}
          <SvgIcon
            name="calendar"
            className="absolute top-1/2 -translate-y-1/2 right-3 w-4 h-4 text-text-weak pointer-events-none"
          />
        </div>
        <span className="text-xs text-text-default shrink-0">
          {t(target === 'from' ? 'COMMON.PERIOD_FILTER.FROM_LABEL' : 'COMMON.PERIOD_FILTER.UNTIL_LABEL')}
        </span>
      </div>
    );
  };

  const rangeView = (
    <>
      <div className="flex flex-col px-4 py-3 gap-3">
        {renderRangeInput('from')}
        {renderRangeInput('to')}
      </div>

      <div className="flex gap-3 justify-end px-4 py-3 border-t border-border-weak bg-bg-surface-soft">
        <Button variant="outline" intent="cancel" size="largePcDefault" onClick={cancelRange}>
          {t('COMMON.PERIOD_FILTER.CANCEL')}
        </Button>
        <Button
          variant="solid"
          size="largePcDefault"
          disabled={!tempFrom || !tempTo}
          dataTestid={testid('apply-button')}
          onClick={confirmRange}
        >
          {t('COMMON.PERIOD_FILTER.APPLY')}
        </Button>
      </div>
    </>
  );

  // 移植元は showBack をテンプレート引数で受けるが、呼び出しはすべて false なので戻るボタンは出さない
  const calendarView = (
    <div className="datepicker flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="w-7" />
        <span className="text-sm font-medium text-text-default">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-secondary"
            onClick={prevMonth}
            aria-label={t('COMMON.BACK')}
          >
            <SvgIcon name="arrowLeft" className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-secondary"
            onClick={nextMonth}
          >
            <SvgIcon name="arrowRight" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <table className="w-full text-center text-xs">
          <thead>
            <tr className="text-text-weak">
              {WEEKDAY_KEYS.map((key) => (
                <th key={key} className="py-1 font-normal w-9">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendarRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="p-0.5">
                    {cell.inMonth && cell.date ? (
                      <button
                        type="button"
                        className={cx(
                          'datepicker-cell w-8 h-8 rounded-full text-sm flex items-center justify-center transition-colors',
                          !cell.isSelected && 'text-text-default',
                          cell.isSelected && 'bg-brand-primary text-white',
                          cell.isToday && !cell.isSelected && 'font-bold text-brand-primary',
                          !cell.isSelected && 'hover:bg-secondary',
                        )}
                        onClick={() => selectDate(cell)}
                      >
                        {cell.day}
                      </button>
                    ) : (
                      <span className="datepicker-cell w-8 h-8 rounded-full text-sm flex items-center justify-center text-text-lighter">
                        {cell.day || ''}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-4 py-2 border-t border-border-weak">
        <Button
          variant="text"
          size="sm"
          dataTestid={testid('calendar-today')}
          onClick={() => applyDateToTarget(formatDate(today))}
        >
          {t('COMMON.PERIOD_FILTER.CALENDAR_TODAY')}
        </Button>
      </div>
    </div>
  );

  const mobileBackButton = (onClick: () => void): ReactNode => (
    <div className="px-4 pt-2">
      <button
        type="button"
        className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-secondary"
        onClick={onClick}
        aria-label={t('COMMON.BACK')}
      >
        <SvgIcon name="arrowLeft" className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      ref={hostRef}
      className={cx('app-period-filter block relative', className)}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cx(
          'trigger-wrapper relative flex items-center w-full pl-3 pr-4 rounded-lg text-sm transition-all duration-200 overflow-hidden cursor-pointer',
          size !== 'small' && 'h-12',
          size === 'small' && 'h-9',
          hasSelection && !isOpen && 'bg-bg-brand-weak has-value',
          (!hasSelection || isOpen) && 'bg-white',
          isOpen && 'is-open',
          disabled && 'bg-surface-disabled opacity-60 cursor-not-allowed',
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        data-testid={testid('trigger')}
        onClick={toggle}
      >
        <span
          className={cx(
            'flex-1 min-w-0 text-ellipsis whitespace-nowrap overflow-hidden font-medium',
            size !== 'small' && 'text-sm',
            size === 'small' && 'text-xs',
            hasSelection && !isOpen && 'text-brand-secondary',
            hasSelection && isOpen && 'text-text-default',
            !hasSelection && 'text-text-lighter',
          )}
        >
          {selectedLabel}
        </span>

        {hasSelection && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center h-4 w-4 ml-2 cursor-pointer text-white bg-text-default rounded-full"
            onClick={clearAll}
          >
            <SvgIcon name="close" className="w-3 h-3" />
          </button>
        )}

        <SvgIcon
          name="arrowDown"
          className={cx(
            '-mr-1.25 shrink-0 w-5 h-5 text-text-weak transition-transform duration-200 ml-2',
            isOpen && 'text-brand-primary! rotate-180',
          )}
        />
      </div>

      {!isMobile && isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 flex gap-1 animate-fade-in" role="dialog">
          <div className="w-[260px] bg-white rounded-xl shadow-default border border-border-strong overflow-hidden shrink-0">
            {mainView}
          </div>

          {(view === 'range' || view === 'calendar') && (
            <div className="relative shrink-0">
              <div className="w-[260px] bg-white rounded-xl shadow-default border border-border-strong overflow-hidden">
                {rangeView}
              </div>

              {view === 'calendar' && (
                <div
                  className={cx(
                    'absolute z-50 left-0 bg-white rounded-xl shadow-default border border-border-strong overflow-hidden animate-fade-in',
                    calendarTarget === 'from' ? 'top-[56px]' : 'top-[108px]',
                  )}
                  style={{ width: '292px' }}
                >
                  {calendarView}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          onClick={(event) => {
            close();
            event.stopPropagation();
          }}
        >
          <div className="absolute inset-0 bg-bg-overlay" />
          <div
            className="relative bg-white rounded-t-xl shadow-default flex flex-col max-h-[85vh] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            {view === 'main' && mainView}
            {view === 'range' && (
              <>
                {mobileBackButton(() => setView('main'))}
                {rangeView}
              </>
            )}
            {view === 'calendar' && (
              <>
                {mobileBackButton(() => setView('range'))}
                {calendarView}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
