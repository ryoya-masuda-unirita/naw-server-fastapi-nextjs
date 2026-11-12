import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './select-with-search.css';
import { cx } from './class-names';
import { AppMatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';
import { useDocumentClick, useLatestRef, useModelState } from './select-hooks';
import type { SelectOption } from './types';
import { useIsMobile } from './use-is-mobile';

/** ボトムドロワーが閉じるアニメーション（duration-300）を待つ時間。移植元はデスクトップでも同じ時間待つ */
const CLOSE_DELAY_MS = 300;
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

export interface SelectWithSearchProps<T = string> {
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'small';
  /** size='small' のときのドロップダウン幅 */
  width?: string;
  supportText?: string;
  /** テスト用の安定セレクタの接頭辞。`${prefix}-trigger` / `${prefix}-option` を付ける */
  testidPrefix?: string | null;
  value?: T | null;
  /** 値が変わったとき（選択・クリア・モバイル入力の全削除） */
  onValueChange?: (value: T | null) => void;
  /** 選択肢を選んだとき */
  onSelectionChange?: (value: T) => void;
  className?: string;
}

/** 移植元 `<app-select-with-search>`（shared/components/select-with-search）。入力で選択肢を絞り込める単一選択 */
export function SelectWithSearch<T = string>({
  options,
  placeholder = '選択してください',
  disabled = false,
  size = 'default',
  width = '240px',
  supportText = '',
  testidPrefix = null,
  value: valueProp = null,
  onValueChange,
  onSelectionChange,
  className,
}: SelectWithSearchProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  // 閉じたあと遅れて非表示にするタイマー。すぐ開き直したときに取り消せるよう持っておく
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hideTimerRef.current), []);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useModelState<T | null>(valueProp, onValueChange);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** モバイルのドロワー内で入力を始めたら true。入力中に選択中ラベルで上書きしないため */
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle>({
    top: '0px',
    left: '0px',
    width: '0px',
    maxHeight: '240px',
  });

  const selectedOption = options.find((opt) => opt.value === value) ?? null;
  const query = searchQuery.toLowerCase();
  const filteredOptions = query ? options.filter((opt) => opt.label.toLowerCase().includes(query)) : options;

  // 移植元は effect で input.value を書き換えている。入力中は検索語、それ以外は選択中のラベルを出す
  const triggerInputValue = isOpen && searchQuery ? searchQuery : (selectedOption?.label ?? '');
  const mobileInputValue = isMobileSearchActive ? searchQuery : (selectedOption?.label ?? '');

  // ドロワーを開いたら入力欄にフォーカスする
  useEffect(() => {
    if (!isMobile || !isOpen) return;
    const frame = requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isMobile, isOpen]);

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
    requestAnimationFrame(() => setIsOpen(true));
  };

  const close = () => {
    setIsOpen(false);
    setSearchQuery('');
    setIsMobileSearchActive(false);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setIsVisible(false), CLOSE_DELAY_MS);
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const handleWrapperClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    // input のクリックは handleInputClick が扱う。ここでも扱うと open と toggle が二重に走る
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    toggle();
  };

  const handleInputClick = () => {
    if (disabled) return;
    // stopPropagation しない。document まで届けて、ほかに開いている select を閉じさせるため
    if (!isOpen) open();
  };

  const handleSearchInput = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    if (!isOpen) open();
  };

  const handleMobileSearchInput = (event: ChangeEvent<HTMLInputElement>) => {
    setIsMobileSearchActive(true);
    setSearchQuery(event.target.value);
    if (!event.target.value) {
      setValue(null);
    }
    if (!isOpen) open();
  };

  const clearSearch = () => {
    setSearchQuery('');
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

  const renderOptionContent = (option: SelectOption<T>): ReactNode => (
    <>
      <span className="flex items-center justify-center w-5 h-5 shrink-0">
        {isSelected(option) && <AppMatIcon icon="check" className="text-[22px]! text-brand-primary" />}
      </span>
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
    </>
  );

  const optionStateClass = (option: SelectOption<T>) =>
    cx(
      isSelected(option) ? 'bg-secondary text-primary' : 'bg-transparent text-text-default hover:bg-secondary',
      option.disabled && 'opacity-50 cursor-not-allowed',
    );

  const emptyResult = filteredOptions.length === 0 && (
    <div className="py-3 text-xs text-center text-text-muted font-medium">{t('COMMON.EMPTY_RESULT')}</div>
  );

  return (
    <div ref={hostRef} className={cx('app-select-with-search block relative', className)} onKeyDown={handleKeyDown}>
      <div
        className={cx(
          'trigger-wrapper relative flex items-center w-full pl-3 pr-4 rounded-lg text-sm transition-all duration-200 overflow-hidden cursor-pointer',
          size !== 'small' ? 'h-12' : 'h-9',
          isOpen && 'is-open',
          size === 'small' && !!selectedOption && !isOpen && 'bg-bg-brand-weak has-value',
          (!selectedOption || isOpen) && 'bg-white',
          disabled && 'bg-surface-disabled opacity-60',
        )}
        data-testid={testidPrefix ? `${testidPrefix}-trigger` : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={handleWrapperClick}
      >
        <div className="flex-1 min-w-0 relative h-full flex items-center">
          {!isOpen && selectedOption && (
            <span
              className={cx(
                'block truncate w-full font-medium text-brand-primary',
                size !== 'small' ? 'text-sm' : 'text-xs',
                size !== 'small' && !!selectedOption && 'text-text-strong',
              )}
            >
              {selectedOption.label}
            </span>
          )}
          <input
            type="text"
            autoComplete="off"
            className={cx(
              'w-full bg-transparent border-none outline-none truncate',
              !isOpen && !!selectedOption && 'opacity-0 absolute',
              size !== 'small' ? 'text-sm' : 'text-xs',
              !!selectedOption && 'text-text-default',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            )}
            value={triggerInputValue}
            disabled={disabled}
            placeholder={placeholder}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            onClick={handleInputClick}
            onChange={handleSearchInput}
          />
        </div>
        {(searchQuery || selectedOption) && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center h-4 w-4 ml-2 cursor-pointer text-white bg-text-default rounded-full"
            onClick={(event) => {
              clearSearch();
              event.stopPropagation();
            }}
          >
            <SvgIcon name="close" className="w-3! h-3!" />
          </button>
        )}
        <span className="shrink-0 w-px h-5 bg-border-weak mx-2" />
        <SvgIcon name="arrowDown" className={cx('w-5 h-5 -mr-1 text-text-weak', isOpen && 'text-brand-primary!')} />
      </div>

      {!isMobile && isOpen && (
        <div
          className="fixed z-9999 bg-white rounded-lg py-4 shadow-default animate-fade-in flex flex-col overflow-hidden"
          style={{
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            maxHeight: dropdownStyle.maxHeight,
          }}
          role="listbox"
        >
          {supportText && <div className="px-4 pb-4 text-xs text-text-muted font-normal shrink-0">{supportText}</div>}
          <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
            {emptyResult}
            {filteredOptions.map((option, index) => (
              <button
                key={`${String(option.value)}-${index}`}
                type="button"
                className={cx(
                  'flex items-center gap-2 w-full px-4 text-sm text-left border-none cursor-pointer transition-colors duration-150 font-normal',
                  size !== 'small' ? 'py-2' : 'py-1',
                  optionStateClass(option),
                )}
                disabled={option.disabled}
                role="option"
                data-testid={testidPrefix ? `${testidPrefix}-option` : undefined}
                aria-selected={isSelected(option)}
                onClick={() => selectOption(option)}
              >
                {renderOptionContent(option)}
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
              'combobox-list relative bg-white rounded-t-16 md:rounded-t-xl shadow-default flex flex-col max-h-[80vh] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              !isOpen && 'translate-y-full',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="combobox-list__search">
              <div className="combobox-list__sp-trigger relative flex h-[36.8px] w-full pl-3 pr-2 bg-white rounded-lg text-sm overflow-hidden is-open">
                <input
                  ref={mobileInputRef}
                  type="text"
                  autoComplete="off"
                  className="combobox-list__sp-input truncate"
                  placeholder={placeholder}
                  value={mobileInputValue}
                  onChange={handleMobileSearchInput}
                />
                {(searchQuery || selectedOption) && (
                  <button
                    type="button"
                    className="shrink-0 flex items-center justify-center h-4 w-4 ml-2 cursor-pointer text-white bg-text-default rounded-full"
                    onClick={clearSearch}
                  >
                    <AppMatIcon icon="close" className="text-[12px]!" />
                  </button>
                )}
                <span className="combobox-separator right-10" />
                <span className="combobox-list__sp-chevron">
                  <SvgIcon className="w-5 h-5 text-brand-primary" name="dropDown" />
                </span>
              </div>
              {supportText && <div className="combobox-list__hint">{supportText}</div>}
            </div>
            <div className="combobox-list__body" role="listbox">
              {emptyResult}
              {filteredOptions.map((option, index) => (
                <button
                  key={`${String(option.value)}-${index}`}
                  type="button"
                  className={cx('combobox-option font-normal', optionStateClass(option))}
                  disabled={option.disabled}
                  role="option"
                  aria-selected={isSelected(option)}
                  onClick={() => selectOption(option)}
                >
                  {renderOptionContent(option)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
