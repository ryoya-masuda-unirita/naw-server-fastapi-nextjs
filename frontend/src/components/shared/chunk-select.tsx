import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './chunk-select.css';
import { Button } from './button';
import { cx } from './class-names';
import { SvgIcon } from './svg-icon';
import { useDocumentClick, useLatestRef, useModelState, useWindowEvent } from './select-hooks';
import type { SelectOption } from './types';
import { useIsMobile } from './use-is-mobile';

const MOBILE_CLOSE_DELAY_MS = 300;
const PANEL_WIDTH_PX = 240;
const PANEL_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
/** 数値入力パネルを「数値を指定」の行の横に並べるための、リスト内の位置（移植元の固定値） */
const OPTION_HEIGHT_PX = 36;
const LIST_PADDING_TOP_PX = 8;
const NUMERIC_OPTION_INDEX = 3;
const PANEL_Z_INDEX = 9999;

const DEFAULT_OPTIONS: SelectOption<string>[] = [
  { value: 'large', label: '大' },
  { value: 'medium', label: '中' },
  { value: 'small', label: '小' },
];

export interface ChunkSelectProps {
  options?: SelectOption<string>[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'small' | 'lg';
  plainStyle?: boolean;
  /** 空文字以外ならエラー枠にする */
  error?: string;
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  /** 選択・数値確定時は値、クリア時は空文字 */
  onSelectionChange?: (value: string) => void;
  className?: string;
}

/**
 * 移植元 `<app-chunk-select>`（shared/components/select/chunk-select）。
 * チャンク分割の大・中・小か、任意の数値を選ぶ。数値は PC では横に並ぶパネル、モバイルではドロワー内で入力する。
 */
export function ChunkSelect({
  options = DEFAULT_OPTIONS,
  placeholder = 'チャンク分割を選択',
  disabled = false,
  size = 'small',
  plainStyle = true,
  error = '',
  value: valueProp = null,
  onValueChange,
  onSelectionChange,
  className,
}: ChunkSelectProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const hostRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useModelState<string | null>(valueProp, onValueChange);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [view, setView] = useState<'list' | 'numeric'>('list');
  const [numericValue, setNumericValue] = useState<number | null>(null);
  const [listPanelStyle, setListPanelStyle] = useState<CSSProperties>({});
  const [numericPanelStyle, setNumericPanelStyle] = useState<CSSProperties>({});

  // 選択肢にない数値（「数値を指定」で入れた値）はその数値をラベルにする
  const matched = options.find((opt) => opt.value === value);
  const selectedOption: SelectOption<string> | null =
    matched ?? (value && !isNaN(Number(value)) ? { value, label: value } : null);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const updatePositions = () => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    let listLeft = rect.left;
    if (listLeft + PANEL_WIDTH_PX > window.innerWidth - VIEWPORT_MARGIN_PX) {
      listLeft = window.innerWidth - PANEL_WIDTH_PX - VIEWPORT_MARGIN_PX;
    }
    setListPanelStyle({
      position: 'fixed',
      top: `${rect.bottom + PANEL_GAP_PX}px`,
      left: `${listLeft}px`,
      width: `${PANEL_WIDTH_PX}px`,
      zIndex: PANEL_Z_INDEX,
    });
    if (!isMobile) {
      const topOffset = LIST_PADDING_TOP_PX + NUMERIC_OPTION_INDEX * OPTION_HEIGHT_PX;
      let numericLeft = listLeft + PANEL_WIDTH_PX + PANEL_GAP_PX;
      if (numericLeft + PANEL_WIDTH_PX > window.innerWidth - VIEWPORT_MARGIN_PX) {
        numericLeft = listLeft - PANEL_WIDTH_PX - PANEL_GAP_PX;
      }
      setNumericPanelStyle({
        position: 'fixed',
        top: `${rect.bottom + PANEL_GAP_PX + topOffset}px`,
        left: `${numericLeft}px`,
        width: `${PANEL_WIDTH_PX}px`,
        zIndex: PANEL_Z_INDEX,
      });
    }
  };

  const open = () => {
    if (disabled) return;
    setView('list');
    setIsVisible(true);
    updatePositions();
    requestAnimationFrame(() => setIsOpen(true));
  };

  const close = () => {
    setIsOpen(false);
    const delay = isMobile ? MOBILE_CLOSE_DELAY_MS : 0;
    setTimeout(() => setIsVisible(false), delay);
  };

  const toggle = () => {
    if (disabled) return;
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const clear = (event?: MouseEvent) => {
    if (event) event.stopPropagation();
    setValue(null);
    onSelectionChange?.('');
    if (isOpen) close();
  };

  const selectOption = (option: SelectOption<string>) => {
    if (option.disabled) return;
    setValue(option.value);
    onSelectionChange?.(option.value);
    close();
  };

  const openNumericView = () => {
    if (value && !isNaN(Number(value))) {
      setNumericValue(Number(value));
    } else {
      setNumericValue(null);
    }
    setView('numeric');
  };

  const confirmNumeric = () => {
    if (numericValue !== null && numericValue > 0) {
      const stringValue = numericValue.toString();
      setValue(stringValue);
      onSelectionChange?.(stringValue);
      close();
    }
  };

  const cancelNumeric = () => {
    setView('list');
  };

  const isSelected = (option: SelectOption<string>) => value === option.value;

  const latest = useLatestRef({ close, updatePositions, isOpen });
  useDocumentClick((event) => {
    if (!hostRef.current?.contains(event.target as Node)) {
      latest.current.close();
    }
  });
  const handleWindowChange = () => {
    if (latest.current.isOpen) {
      latest.current.updatePositions();
    }
  };
  useWindowEvent('resize', handleWindowChange);
  useWindowEvent('scroll', handleWindowChange);

  // ngModel（type="number"）と同じく、空欄は null、それ以外は数値として持つ
  const handleNumericInput = (raw: string) => {
    setNumericValue(raw === '' ? null : Number(raw));
  };

  const optionButtons = options.map((option, index) => (
    <button
      key={`${option.value}-${index}`}
      type="button"
      className="dl-option"
      data-selected={isSelected(option) ? 'true' : undefined}
      onClick={() => selectOption(option)}
    >
      <span className="dl-option__check">
        <SvgIcon name="newCheck" className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0 truncate text-xs">{option.label}</span>
    </button>
  ));

  const numericOptionButton = (
    <button
      type="button"
      className="dl-option"
      onClick={(event) => {
        openNumericView();
        event.stopPropagation();
      }}
    >
      <span className="dl-option__check" />
      <span className="flex-1 min-w-0 truncate text-xs">数値を指定</span>
      <SvgIcon name="arrowRight" className="w-5 h-5 text-text-weak" />
    </button>
  );

  const numericActions = (
    <div className="flex gap-3 justify-end text-btn font-medium p-4 border-t border-border-weak bg-bg-surface-soft">
      <Button
        variant="outline"
        intent="cancel"
        size="largePcDefault"
        classProps="!text-btn !font-medium"
        onClick={(event) => {
          cancelNumeric();
          event.stopPropagation();
        }}
      >
        {t('COMMON.CANCEL')}
      </Button>
      <Button
        variant="solid"
        size="largePcDefault"
        classProps="!text-btn !font-medium"
        onClick={(event) => {
          confirmNumeric();
          event.stopPropagation();
        }}
      >
        {t('COMMON.CONFIRM_SELECTION')}
      </Button>
    </div>
  );

  const numericInput = (inputClass: string) => (
    <input
      type="number"
      value={numericValue ?? ''}
      onChange={(event) => handleNumericInput(event.target.value)}
      className={inputClass}
      placeholder="数値を入力"
      onClick={(event) => event.stopPropagation()}
    />
  );

  return (
    <div ref={hostRef} className={cx('app-chunk-select block relative', className)}>
      <div
        className={cx(
          'trigger-wrapper relative flex items-center w-full rounded-lg text-sm transition-all duration-200 overflow-hidden cursor-pointer',
          !!error && 'has-error',
          size === 'lg' && 'h-12 px-4',
          size !== 'lg' && 'h-9 pl-3 pr-4',
          !!selectedOption && !isVisible && !plainStyle && 'bg-bg-brand-weak',
          (!selectedOption || isVisible || plainStyle) && !disabled && 'bg-white',
          disabled && 'bg-bg-tertiary',
          !!selectedOption && !isOpen && !plainStyle && !disabled && 'has-value',
          isOpen && 'is-open',
          disabled && 'disabled cursor-not-allowed',
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        <span
          className={cx(
            'flex-1 min-w-0 text-ellipsis whitespace-nowrap overflow-hidden',
            size === 'lg' && 'text-body leading-12',
            size !== 'lg' && 'leading-9',
            !!selectedOption && !disabled && 'text-text-strong',
            !selectedOption && !disabled && 'text-text-weak',
            disabled && 'text-text-disabled',
          )}
        >
          {displayLabel}
        </span>
        {selectedOption && !disabled && (
          <button
            type="button"
            className="shrink-0 flex items-center justify-center h-4 w-4 ml-2 cursor-pointer text-white bg-text-default rounded-full hover:bg-text-strong transition-colors"
            onClick={clear}
          >
            <SvgIcon name="close" className="w-3 h-3" />
          </button>
        )}
        <SvgIcon name="arrowDown" className={cx('w-5 h-5 text-text-weak', isOpen && 'text-brand-primary!')} />
      </div>

      {!isMobile && isOpen && (
        <>
          <div
            className="bg-white rounded-xl shadow-default animate-fade-in flex flex-col overflow-hidden border border-border-strong"
            style={listPanelStyle}
            role="listbox"
          >
            <div className="flex flex-col py-2">
              {optionButtons}
              {numericOptionButton}
            </div>
          </div>
          {view === 'numeric' && (
            <div
              className="bg-white rounded-xl shadow-default animate-fade-in flex flex-col overflow-hidden border border-border-strong"
              style={numericPanelStyle}
            >
              <div className="flex flex-col animate-fade-in">
                <div className="p-4 flex flex-col gap-2">
                  {numericInput(
                    'input-parts-field h-12 px-3 rounded-lg border border-border-strong focus:border-brand-primary outline-none text-sm w-full',
                  )}
                </div>
                {numericActions}
              </div>
            </div>
          )}
        </>
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
              'relative bg-white rounded-t-xl shadow-default flex flex-col max-h-[85vh] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
              !isOpen && 'translate-y-full',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {view === 'list' ? (
              <div className="flex flex-col py-4">
                {optionButtons}
                {numericOptionButton}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="px-4 pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-secondary"
                    onClick={(event) => {
                      cancelNumeric();
                      event.stopPropagation();
                    }}
                  >
                    <SvgIcon name="arrowLeft" className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  {numericInput(
                    'input-parts-field h-12 px-4 rounded-lg border border-border-strong focus:border-brand-primary outline-none text-base w-full',
                  )}
                </div>
                {numericActions}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
