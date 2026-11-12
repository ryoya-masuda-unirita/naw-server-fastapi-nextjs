import { useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './multi-select.css';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { cx } from './class-names';
import { AppMatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';
import { getClippingAncestorBounds, useDocumentClick, useLatestRef, useModelState, useWindowEvent } from './select-hooks';
import type { SelectOption } from './types';
import { useIsMobile } from './use-is-mobile';

const MOBILE_CLOSE_DELAY_MS = 300;
/** ドロップダウンと画面（または切り取る祖先）の端との余白 */
const EDGE_MARGIN_PX = 16;
/** 下の余白がこれ未満で、上の方が広ければ上に開く */
const PLACE_ABOVE_THRESHOLD_PX = 240;
const DROPDOWN_MIN_HEIGHT_PX = 160;

/** 既定値を毎回新しい配列にすると useModelState が「値が変わった」と判定し続けるため、定数にする */
const EMPTY_VALUE: never[] = [];

export interface MultiSelectProps<T = string> {
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** 移植元にあるが描画には使われていない */
  size?: 'default' | 'small';
  /** 移植元にあるが描画には使われていない */
  width?: string;
  supportText?: string;
  /** デスクトップで常にトリガーの下に開く */
  forceBelow?: boolean;
  value?: T[];
  /**
   * 内部の値が変わるたびに呼ぶ（開いている間のチェック操作・キャンセル時の巻き戻しを含む）。
   * 移植元の `[(value)]` / `(valueChange)` と同じタイミング。
   */
  onValueChange?: (value: T[]) => void;
  /** 「選択を確定」・チップの削除で値が確定したとき */
  onSelectionChange?: (value: T[]) => void;
  className?: string;
}

/**
 * 移植元 `<app-multi-select>`（shared/components/multi-select）。
 * チェックボックスで複数選択し、「選択を確定」で確定する。外側クリック・Esc・キャンセルでは開く前の値に戻す。
 */
export function MultiSelect<T = string>({
  options,
  placeholder = '選択してください',
  disabled = false,
  supportText = '',
  forceBelow = false,
  value: valueProp = EMPTY_VALUE,
  onValueChange,
  onSelectionChange,
  className,
}: MultiSelectProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  /** 開いたときの値。キャンセルで戻すため */
  const snapshotRef = useRef<T[] | null>(null);
  const [value, setValue] = useModelState<T[]>(valueProp, onValueChange);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState('300px');
  const [placeAbove, setPlaceAbove] = useState(false);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));
  const hasValue = value.length > 0;
  const enabledOptions = options.filter((o) => !o.disabled);
  const allSelected = enabledOptions.length > 0 && enabledOptions.every((o) => value.includes(o.value));
  const someSelected = hasValue && !allSelected;

  const updateDropdownLayout = () => {
    if (isMobile || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const { top: containerTop, bottom: containerBottom } = getClippingAncestorBounds(hostRef.current);
    const spaceBelow = containerBottom - rect.bottom - EDGE_MARGIN_PX;
    const spaceAbove = rect.top - containerTop - EDGE_MARGIN_PX;
    // ダイアログの下端近くなど、上の方が明らかに広いときだけ上に開く
    const above = !forceBelow && spaceAbove > spaceBelow && spaceBelow < PLACE_ABOVE_THRESHOLD_PX;
    setPlaceAbove(above);
    const available = above ? spaceAbove : spaceBelow;
    setDropdownMaxHeight(`${Math.max(available, DROPDOWN_MIN_HEIGHT_PX)}px`);
  };

  const latest = useLatestRef({ updateDropdownLayout, isOpen, isMobile });

  const scheduleUpdateDropdownLayout = () => {
    if (!isOpen || isMobile) return;
    // チップが増減してトリガーの高さが変わった後に測り直す
    requestAnimationFrame(() => requestAnimationFrame(() => latest.current.updateDropdownLayout()));
  };

  const open = () => {
    if (disabled) return;
    snapshotRef.current = [...value];
    setIsVisible(true);
    requestAnimationFrame(() => {
      latest.current.updateDropdownLayout();
      setIsOpen(true);
    });
  };

  const finishClose = () => {
    setIsOpen(false);
    const delay = isMobile ? MOBILE_CLOSE_DELAY_MS : 0;
    setTimeout(() => setIsVisible(false), delay);
  };

  const confirm = () => {
    if (!isOpen) return;
    snapshotRef.current = null;
    onSelectionChange?.(value);
    finishClose();
  };

  const cancel = () => {
    if (!isOpen) return;
    if (snapshotRef.current !== null) {
      setValue(snapshotRef.current);
    }
    snapshotRef.current = null;
    finishClose();
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) {
      cancel();
    } else {
      open();
    }
  };

  const isSelected = (option: SelectOption<T>) => value.includes(option.value);

  // 開いている間の操作は確定（confirm）まで selectionChange を出さない
  const toggleOption = (option: SelectOption<T>) => {
    if (option.disabled) return;
    const next = isSelected(option) ? value.filter((v) => v !== option.value) : [...value, option.value];
    setValue(next);
    scheduleUpdateDropdownLayout();
  };

  const toggleAll = () => {
    const next = allSelected ? [] : enabledOptions.map((o) => o.value);
    setValue(next);
    scheduleUpdateDropdownLayout();
  };

  const removeChip = (event: MouseEvent, optionValue: T) => {
    event.stopPropagation();
    const next = value.filter((v) => v !== optionValue);
    setValue(next);
    onSelectionChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isOpen) open();
        break;
      case 'Escape':
        cancel();
        break;
    }
  };

  const cancelRef = useLatestRef(cancel);
  useDocumentClick((event) => {
    if (!hostRef.current?.contains(event.target as Node)) {
      cancelRef.current();
    }
  });
  const handleWindowChange = () => {
    if (latest.current.isOpen && !latest.current.isMobile) {
      latest.current.updateDropdownLayout();
    }
  };
  useWindowEvent('resize', handleWindowChange);
  useWindowEvent('scroll', handleWindowChange);

  const chips = selectedOptions.map((opt, index) => (
    <span key={`${String(opt.value)}-${index}`} className="combobox-chip" onClick={(event) => event.stopPropagation()}>
      <span className="truncate max-w-24">{opt.label}</span>
      <button aria-label={opt.label} onClick={(event) => removeChip(event, opt.value)} type="button" className="combobox-chip-remove">
        <SvgIcon name="closePath" className="w-3! h-3!" />
      </button>
    </span>
  ));

  const placeholderLabel = (
    <span className="flex-1 min-w-0 truncate font-medium text-sm text-text-lighter">{placeholder}</span>
  );

  const selectAllLabel = !allSelected ? t('COMMON.SELECT_ALL') : t('COMMON.RELEASE_ALL');

  const optionLabel = (option: SelectOption<T>) => (
    <span
      className={cx(
        'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm',
        isSelected(option) && 'text-brand-secondary font-medium',
        !isSelected(option) && 'text-text-default',
      )}
    >
      {option.label}
    </span>
  );

  return (
    <div ref={hostRef} className={cx('app-multi-select block relative', className)} onKeyDown={handleKeyDown}>
      <div
        className={cx(
          'trigger-wrapper relative flex min-h-12 w-full flex-wrap items-center gap-1 rounded-lg bg-white pl-4 pr-4 py-2 cursor-pointer transition-all duration-200',
          isOpen && 'is-open',
          hasValue && !isOpen && 'has-value',
          disabled && 'bg-surface-disabled opacity-60 cursor-not-allowed',
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        {hasValue ? chips : placeholderLabel}
        <AppMatIcon
          icon="expand_more"
          className={cx('text-[20px]! ml-auto shrink-0 text-text-weak transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </div>

      {!isMobile && isVisible && (
        <div
          className={cx(
            'absolute left-0 right-0 z-50 py-4 gap-2 bg-white rounded-xl shadow-default animate-fade-in flex flex-col overflow-hidden border border-border-strong',
            !isOpen && 'opacity-0',
            !placeAbove && 'top-full mt-1',
            placeAbove && 'bottom-full mb-1',
          )}
          style={{ maxHeight: dropdownMaxHeight }}
          role="listbox"
          aria-multiselectable="true"
          onClick={(event) => event.stopPropagation()}
        >
          {supportText && <div className="px-4 pt-4 pb-2 text-xs text-text-muted font-normal shrink-0">{supportText}</div>}
          <div className="flex flex-col min-h-0 overflow-y-auto gap-2">
            <button
              type="button"
              className="flex items-center gap-3 w-full px-4 py-1 text-base text-left border-none cursor-pointer transition-colors duration-150 shrink-0 hover:bg-bg-brand-weak"
              onClick={toggleAll}
            >
              <span className="flex items-center justify-center w-5 h-5 shrink-0">
                <Checkbox checked={allSelected} indeterminate={someSelected} isHeader />
              </span>
              <span
                className={cx(
                  'flex-1 text-sm font-medium',
                  (allSelected || someSelected) && 'text-brand-primary',
                  !allSelected && !someSelected && 'text-text-default',
                )}
              >
                {selectAllLabel}
              </span>
            </button>
            {options.length === 0 && <div className="py-1 text-base text-center text-text-muted">{t('COMMON.EMPTY_RESULT')}</div>}
            {options.map((option, index) => (
              <button
                key={`${String(option.value)}-${index}`}
                type="button"
                className={cx(
                  'flex items-center gap-3 w-full px-4 py-1 text-base text-left border-none cursor-pointer transition-colors duration-150',
                  isSelected(option) && 'bg-bg-brand-weak',
                  !isSelected(option) && 'hover:bg-bg-brand-weak',
                  option.disabled && 'opacity-50 cursor-not-allowed',
                )}
                disabled={option.disabled}
                role="option"
                aria-selected={isSelected(option)}
                onClick={() => toggleOption(option)}
              >
                <span className="flex items-center justify-center w-5 h-5 shrink-0">
                  <Checkbox checked={isSelected(option)} indeterminate={false} />
                </span>
                {optionLabel(option)}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white px-4 pt-4">
            <Button variant="outline" size="sm" heightPx={36} onClick={cancel} className="dialog-cancel-btn">
              {t('COMMON.CANCEL')}
            </Button>
            <Button variant="solid" size="sm" heightPx={36} onClick={confirm}>
              {t('COMMON.CONFIRM_SELECTION')}
            </Button>
          </div>
        </div>
      )}

      {isMobile && isVisible && (
        <div
          className={cx(
            'fixed inset-0 z-200 flex flex-col justify-end transition-opacity duration-200',
            !isOpen && 'opacity-0 pointer-events-none',
          )}
          onClick={(event) => {
            confirm();
            event.stopPropagation();
          }}
        >
          <div className="absolute inset-0 bg-bg-overlay" />
          <div
            className={cx(
              'relative bg-white rounded-t-2xl shadow-default flex flex-col max-h-[80vh] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] gap-4',
              !isOpen && 'translate-y-full',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pt-4 px-4">
              <div
                className={cx(
                  'combobox-list__sp-trigger',
                  isOpen && 'is-open',
                  hasValue && !isOpen && 'has-value',
                  disabled && 'bg-surface-disabled opacity-60',
                )}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
              >
                {hasValue ? chips : placeholderLabel}
                <span className="combobox-list__sp-chevron">
                  <AppMatIcon
                    icon="expand_more"
                    className={cx(
                      'text-[20px]! shrink-0 text-text-weak transition-transform duration-200',
                      isOpen && 'rotate-180 !text-brand-primary',
                    )}
                  />
                </span>
              </div>
            </div>
            {supportText && <div className="px-4 pt-4 text-xs text-text-muted font-normal shrink-0">{supportText}</div>}
            <div className="flex flex-col overflow-y-auto min-h-0 gap-2" role="listbox" aria-multiselectable="true">
              <button type="button" className="combobox-select-all" onClick={toggleAll}>
                <span className="flex items-center justify-center w-5 h-5 shrink-0">
                  <Checkbox isHeader checked={allSelected} indeterminate={someSelected} />
                </span>
                <span>{selectAllLabel}</span>
              </button>
              {options.length === 0 && <div className="py-3 text-xs text-center text-text-muted">{t('COMMON.EMPTY_RESULT')}</div>}
              {options.map((option, index) => (
                <button
                  key={`${String(option.value)}-${index}`}
                  type="button"
                  className={cx(
                    'flex items-center gap-2 w-full px-4 py-1 text-sm text-left border-none cursor-pointer transition-colors duration-150 font-medium',
                    isSelected(option) && 'bg-bg-brand-weak',
                    !isSelected(option) && 'hover:bg-bg-brand-weak',
                    option.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                  disabled={option.disabled}
                  role="option"
                  aria-selected={isSelected(option)}
                  onClick={() => toggleOption(option)}
                >
                  <span className="flex items-center justify-center w-5 h-5 shrink-0">
                    <Checkbox checked={isSelected(option)} indeterminate={false} />
                  </span>
                  {optionLabel(option)}
                </button>
              ))}
            </div>
            <div className="combobox-multi-footer pb-4">
              <Button variant="outline" onClick={cancel} className="dialog-cancel-btn" size="largePcDefault">
                {t('COMMON.CANCEL')}
              </Button>
              <Button variant="solid" onClick={confirm} size="largePcDefault">
                {t('COMMON.CONFIRM_SELECTION')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
