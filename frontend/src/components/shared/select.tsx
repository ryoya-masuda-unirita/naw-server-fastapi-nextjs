import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './select.css';
import { cx } from './class-names';
import { AppMatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';
import { useDocumentClick, useLatestRef, useModelState } from './select-hooks';
import type { SelectOption } from './types';
import { useIsMobile } from './use-is-mobile';

/** モバイルのボトムドロワーが閉じるアニメーション（duration-300）を待つ時間 */
const MOBILE_CLOSE_DELAY_MS = 300;
const DROPDOWN_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const DROPDOWN_MAX_HEIGHT_PX = 300;
const DROPDOWN_MIN_HEIGHT_PX = 120;

interface DropdownStyle {
  top: string;
  left: string;
  width: string;
  maxHeight: string;
}

export interface SelectProps<T = string> {
  options: SelectOption<T>[];
  /** 移植元は日本語の既定値をハードコードしている */
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'small';
  /** size='small' のときのドロップダウン幅 */
  width?: string;
  /** ドロップダウン上部に出す補足文 */
  supportText?: string;
  /** 選択済みでも背景色・ブランド色を付けない */
  plainStyle?: boolean;
  showClear?: boolean;
  /** トリガーに足すクラス */
  classNameInputSelect?: string;
  value?: T | null;
  /** 値が変わったとき（選択・クリア・キーボード操作）。移植元の `[(value)]` / ControlValueAccessor */
  onValueChange?: (value: T | null) => void;
  /** 選択肢を選んだとき（クリアでは呼ばない） */
  onSelectionChange?: (value: T) => void;
  /** 移植元で `<app-select class="...">` に付けていたクラス */
  className?: string;
}

/** 移植元 `<app-select>`（shared/components/select/select.component） */
export function Select<T = string>({
  options,
  placeholder = '選択してください',
  disabled = false,
  size = 'default',
  width = '240px',
  supportText = '',
  plainStyle = false,
  showClear = true,
  classNameInputSelect = '',
  value: valueProp = null,
  onValueChange,
  onSelectionChange,
  className,
}: SelectProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  // 閉じたあと遅れて非表示にするタイマー。すぐ開き直したときに取り消せるよう持っておく
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hideTimerRef.current), []);
  const [value, setValue] = useModelState<T | null>(valueProp, onValueChange);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle>({
    top: '0px',
    left: '0px',
    width: '0px',
    maxHeight: '240px',
  });

  const selectedOption = options.find((opt) => opt.value === value) ?? null;
  const displayLabel = selectedOption?.label ?? placeholder;

  const open = () => {

    clearTimeout(hideTimerRef.current);
    if (disabled || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
    const maxHeight = Math.max(Math.min(spaceBelow, DROPDOWN_MAX_HEIGHT_PX), DROPDOWN_MIN_HEIGHT_PX);
    setDropdownStyle({
      top: `${rect.bottom + DROPDOWN_GAP_PX}px`,
      left: `${rect.left}px`,
      width: size === 'small' ? width : `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
    });
    setIsVisible(true);
    // マウント後にクラスを切り替えてドロワーのスライドインを動かす
    requestAnimationFrame(() => setIsOpen(true));
  };

  const close = () => {
    setIsOpen(false);
    const delay = isMobile ? MOBILE_CLOSE_DELAY_MS : 0;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setIsVisible(false), delay);
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const clearValue = () => {
    setValue(null);
  };

  const selectOption = (option: SelectOption<T>) => {
    if (option.disabled) return;
    setValue(option.value);
    onSelectionChange?.(option.value);
    close();
  };

  const isSelected = (option: SelectOption<T>) => value === option.value;

  const focusNextOption = () => {
    const currentIndex = options.findIndex((opt) => opt.value === value);
    const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
    const nextOption = options[nextIndex];
    if (nextOption && !nextOption.disabled) {
      selectOption(nextOption);
    }
  };

  const focusPreviousOption = () => {
    const currentIndex = options.findIndex((opt) => opt.value === value);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
    const prevOption = options[prevIndex];
    if (prevOption && !prevOption.disabled) {
      selectOption(prevOption);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        toggle();
        break;
      case 'Escape':
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          open();
        } else {
          focusNextOption();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) {
          focusPreviousOption();
        }
        break;
    }
  };

  const closeRef = useLatestRef(close);
  useDocumentClick((event) => {
    if (!hostRef.current?.contains(event.target as Node)) {
      closeRef.current();
    }
  });

  const renderCheck = (option: SelectOption<T>) => (
    <span className="flex items-center justify-center w-5 h-5 shrink-0">
      {isSelected(option) && <AppMatIcon icon="check" className="text-[22px]! text-brand-primary" />}
    </span>
  );

  const optionStateClass = (option: SelectOption<T>) =>
    cx(
      isSelected(option) ? 'bg-secondary text-primary' : 'bg-transparent text-text-default hover:bg-secondary',
      option.disabled && 'opacity-50 cursor-not-allowed',
    );

  const emptyResult = options.length === 0 && (
    <div className="py-3 text-xs text-center text-text-muted">{t('COMMON.EMPTY_RESULT')}</div>
  );

  return (
    <div ref={hostRef} className={cx('app-select block relative', className)} onKeyDown={handleKeyDown}>
      <div
        className={cx(
          'trigger-wrapper relative flex items-center w-full pl-3 pr-4 rounded-lg text-sm transition-all duration-200 overflow-hidden cursor-pointer',
          size !== 'small' && 'h-12',
          size === 'small' && 'h-9',
          !!selectedOption && !isVisible && !plainStyle && 'bg-bg-brand-weak',
          (!selectedOption || isVisible || plainStyle) && 'bg-white',
          !!selectedOption && !isOpen && !plainStyle && 'has-value',
          isOpen && 'is-open',
          disabled && 'bg-surface-disabled opacity-60 cursor-not-allowed',
          classNameInputSelect,
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        <span
          className={cx(
            'flex-1 min-w-0 text-ellipsis whitespace-nowrap overflow-hidden font-medium',
            size !== 'small' && 'text-sm',
            size === 'small' && 'text-xs',
            !!selectedOption && !isOpen && !plainStyle && 'text-brand-secondary',
            !!selectedOption && !plainStyle && 'text-text-strong',
            !!selectedOption && plainStyle && 'text-text-medium',
            !selectedOption && 'text-text-lighter',
          )}
        >
          {displayLabel}
        </span>
        {selectedOption && showClear && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center h-4 w-4 ml-2 cursor-pointer text-white bg-text-default rounded-full"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              clearValue();
              event.stopPropagation();
            }}
          >
            <SvgIcon name="close" className="w-3 h-3" />
          </button>
        )}
        <SvgIcon name="arrowDown" className={cx('w-5 h-5 -mr-1 text-text-weak ml-2', isOpen && 'text-brand-primary!')} />
      </div>

      {!isMobile && isOpen && (
        <div
          className="fixed z-9999 bg-white rounded-xl py-4 shadow-default animate-fade-in flex flex-col overflow-hidden border border-border-strong px-px"
          style={{
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            maxHeight: dropdownStyle.maxHeight,
          }}
          role="listbox"
        >
          {supportText && <div className="px-4 pb-4 text-xs text-text-muted font-normal shrink-0">{supportText}</div>}
          <div className="flex flex-col overflow-y-auto min-h-0">
            {emptyResult}
            {options.map((option, index) => (
              <button
                key={`${String(option.value)}-${index}`}
                type="button"
                className={cx(
                  'flex items-center gap-2 w-full px-4 text-sm text-left border-none cursor-pointer transition-colors duration-150 font-normal py-2',
                  optionStateClass(option),
                )}
                disabled={option.disabled}
                role="option"
                aria-selected={isSelected(option)}
                onClick={() => selectOption(option)}
              >
                {renderCheck(option)}
                {option.description || option.category ? (
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div
                      className={cx(
                        'overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium',
                        isSelected(option) && 'text-brand-secondary',
                      )}
                    >
                      {option.label}
                    </div>
                    <div className="flex items-start gap-2 mt-0.5">
                      <div className="text-label-small text-text-muted line-clamp-2 flex-1">{option.description}</div>
                    </div>
                    {option.category && (
                      <span className="inline-flex self-start rounded-sm border border-border-strong p-1 text-note-small font-medium whitespace-nowrap text-text-medium">
                        {option.category}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">{option.label}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isMobile && isVisible && (
        <div
          className={cx(
            'fixed inset-0 z-50 flex flex-col justify-end transition-opacity duration-200',
            !isOpen && 'opacity-0 pointer-events-none',
          )}
          onClick={(event) => {
            close();
            event.stopPropagation();
          }}
        >
          <div className="absolute inset-0 bg-bg-overlay" />
          <div
            className={cx(
              'relative bg-white rounded-t-xl shadow-default flex flex-col max-h-[80vh] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              !isOpen && 'translate-y-full',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {supportText && <div className="px-4 pt-4 text-xs text-text-muted font-normal shrink-0">{supportText}</div>}
            <div className="flex flex-col gap-1 overflow-y-auto min-h-0 py-4" role="listbox">
              {emptyResult}
              {options.map((option, index) => (
                <button
                  key={`${String(option.value)}-${index}`}
                  type="button"
                  className={cx(
                    'flex items-start gap-2 w-full px-4 py-2 text-sm text-left border-none cursor-pointer transition-colors duration-150 font-normal',
                    optionStateClass(option),
                  )}
                  disabled={option.disabled}
                  role="option"
                  aria-selected={isSelected(option)}
                  onClick={() => selectOption(option)}
                >
                  {renderCheck(option)}
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
