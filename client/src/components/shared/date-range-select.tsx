import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './cdk-overlay.css';
import './date-range-select.css';
import { cx } from './class-names';
import { MatIcon } from './icons/mat-icon';

export interface DateRangeOption {
  /** i18n キー */
  label: string;
  value: string;
}

export interface DateRangeValue {
  start: string;
  end: string;
}

export interface DateRangeChange {
  period: string;
  customRange?: DateRangeValue;
}

/** 移植元 subMenuPositions の offsetX（「期間を指定」行の右端からサブメニューまでの距離） */
const SUB_MENU_OFFSET_X = 8;

interface DateRangeSelectProps {
  options: DateRangeOption[];
  period?: string;
  customRange?: DateRangeValue | null;
  onPeriodChange?: (period: string) => void;
  onCustomRangeChange?: (range: DateRangeValue | null) => void;
  /** 移植元の output `handleChange` */
  onHandleChange?: (change: DateRangeChange) => void;
  className?: string;
}

/**
 * 移植元 `<app-date-range-select>`（shared/components/filter/date-range-select）。
 * プリセットの選択肢と、ホバーで開く日付指定のサブメニューを持つ。
 * 移植元は CDK の connected overlay で出すので、React では body 直下へ portal して同じ位置に置く。
 */
export function DateRangeSelect({
  options,
  period = 'all',
  customRange = null,
  onPeriodChange,
  onCustomRangeChange,
  onHandleChange,
  className,
}: DateRangeSelectProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLDivElement>(null);
  const subMenuTriggerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const [subMenuPosition, setSubMenuPosition] = useState({ top: 0, left: 0 });

  const selectedLabel = (() => {
    if (period === 'custom' && customRange) {
      return `${customRange.start} ~ ${customRange.end}`;
    }
    const option = options.find((o) => o.value === period);
    return option ? option.label : 'COMMON.ALL_PERIODS';
  })();

  const isValidCustomRange = !!tempStartDate && !!tempEndDate;

  const toggleOpen = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPosition({ top: rect.bottom, left: rect.left });
    }
    const next = !isOpen;
    setIsOpen(next);
    if (!next) {
      setIsSubMenuOpen(false);
    }
  };

  const close = () => {
    setIsOpen(false);
    setIsSubMenuOpen(false);
  };

  const openSubMenu = () => {
    if (subMenuTriggerRef.current) {
      const rect = subMenuTriggerRef.current.getBoundingClientRect();
      setSubMenuPosition({ top: rect.top, left: rect.right + SUB_MENU_OFFSET_X });
    }
    setIsSubMenuOpen(true);
    if (period === 'custom' && customRange) {
      setTempStartDate(customRange.start);
      setTempEndDate(customRange.end);
    }
  };

  const closeSubMenu = () => setIsSubMenuOpen(false);

  const selectOption = (value: string) => {
    onPeriodChange?.(value);
    onHandleChange?.({ period: value });
    close();
  };

  const clearCustom = () => {
    setTempStartDate('');
    setTempEndDate('');
    selectOption('all');
  };

  const applyCustom = () => {
    if (!isValidCustomRange) return;
    const range = { start: tempStartDate, end: tempEndDate };
    onPeriodChange?.('custom');
    onCustomRangeChange?.(range);
    onHandleChange?.({ period: 'custom', customRange: range });
    close();
  };

  return (
    <span className={cx('app-date-range-select', className)}>
      <div
        ref={triggerRef}
        onClick={toggleOpen}
        className={cx(
          'relative flex items-center justify-between w-full h-10 px-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors',
          isOpen && 'ring-2 ring-primary',
        )}
      >
        <span className="text-sm text-text-default truncate">{t(selectedLabel)}</span>
        <MatIcon name="expand_more" size={16} className={cx(
            'text-gray-400 transition-transform duration-200 flex-shrink-0',
            isOpen && 'rotate-180',
          )} />
      </div>

      {isOpen &&
        createPortal(
          <>
            {/* CDK overlay の backdrop（既定は dark。styles.css の .cdk-overlay-backdrop で bg-bg-overlay になる） */}
            <div
              className="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing fixed inset-0 z-[1000] bg-bg-overlay"
              onClick={close}
            />
            <div
              className="app-date-range-select-panel z-[1000]"
              style={{ position: 'fixed', top: panelPosition.top, left: panelPosition.left }}
            >
              <div className="w-[200px] mt-2 bg-white rounded-lg shadow-lg border border-slate-100 overflow-visible py-1 animate-fade-in relative z-50">
                <div className="flex flex-col">
                  {options.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => selectOption(option.value)}
                      onMouseEnter={closeSubMenu}
                      className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        {period === option.value ? (
                          <MatIcon name="check" size={16} className="text-primary" />
                        ) : (
                          <div className="w-4" />
                        )}
                        <span className="text-sm text-text-default group-hover:text-primary">
                          {t(option.label)}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div
                    ref={subMenuTriggerRef}
                    onMouseEnter={openSubMenu}
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors border-t border-slate-100 mt-1 bg-slate-50 group relative"
                  >
                    <div className="flex items-center gap-2">
                      {period === 'custom' ? (
                        <MatIcon name="check" size={16} className="text-primary" />
                      ) : (
                        <div className="w-4" />
                      )}
                      <span className="text-sm text-text-default group-hover:text-primary">
                        {t('COMMON.SPECIFY_PERIOD')}
                      </span>
                    </div>
                    <MatIcon name="chevron_right" size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>
            </div>

            {isSubMenuOpen && (
              <div
                className="app-date-range-select-panel z-[1000]"
                style={{ position: 'fixed', top: subMenuPosition.top, left: subMenuPosition.left }}
              >
                <div
                  onMouseEnter={openSubMenu}
                  onMouseLeave={closeSubMenu}
                  className="w-[280px] ml-2 bg-white rounded-lg shadow-lg border border-slate-100 p-3 animate-fade-in z-50"
                >
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="date"
                          value={tempStartDate}
                          onChange={(event) => setTempStartDate(event.target.value)}
                          aria-label={t('COMMON.START_DATE')}
                          className="w-full h-9 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary bg-transparent text-text-default"
                        />
                      </div>
                      <span className="text-xs text-text-default">{t('COMMON.START_DATE')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="date"
                          value={tempEndDate}
                          onChange={(event) => setTempEndDate(event.target.value)}
                          aria-label={t('COMMON.END_DATE')}
                          className="w-full h-9 px-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-primary bg-transparent text-text-default"
                        />
                      </div>
                      <span className="text-xs text-text-default">{t('COMMON.END_DATE')}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    {/* 移植元のボタンは type 未指定。portal 先はフォーム外なので type="button" と同じ挙動になる */}
                    <button
                      type="button"
                      onClick={clearCustom}
                      className="text-xs text-primary hover:underline whitespace-nowrap"
                    >
                      {t('COMMON.CLEAR_SELECTION')}
                    </button>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={close} className="text-xs text-text-default hover:underline">
                        {t('COMMON.CANCEL')}
                      </button>
                      <button
                        type="button"
                        onClick={applyCustom}
                        className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover disabled:opacity-50 whitespace-nowrap"
                        disabled={!isValidCustomRange}
                      >
                        {t('COMMON.APPLY')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </span>
  );
}
