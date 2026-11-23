import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { cx } from './class-names';
import { MatIcon } from './icons/mat-icon';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  tag?: string;
  category?: string;
}

interface FormComboboxProps {
  /** 表示済みの文言（移植元も翻訳せずそのまま出す） */
  label: string;
  badgeText?: string;
  supportText?: string;
  placeholder?: string;
  options?: ComboboxOption[];
  disabled?: boolean;
  error?: string;
  value?: string[];
  className?: string;
  onValueChange?: (value: string[]) => void;
  /** 移植元の formBlur。ドロップダウンを閉じたときに通知する */
  onFormBlur?: () => void;
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
}

/** 移植元のチップ削除アイコン（cancel）は塗りつぶし・16px の字形を使う */
const CHIP_REMOVE_ICON_STYLE = { fontVariationSettings: "'FILL' 1, 'GRAD' 0, 'opsz' 16, 'wght' 400" };

/**
 * 移植元 `<app-form-combobox>`（shared/components/form/form-combobox）。チェックボックス付きの複数選択。
 * 移植元の検索欄はテンプレートでコメントアウトされており、searchPlaceholder・検索での絞り込みは使われていないため移していない。
 */
export function FormCombobox({
  label,
  badgeText = '',
  supportText = '',
  placeholder = '選択してください',
  options = [],
  disabled = false,
  error = '',
  value = [],
  className,
  onValueChange,
  onFormBlur,
}: FormComboboxProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const isOpen = panel !== null;

  const selectedCount = options.filter((opt) => value.includes(opt.value)).length;
  const isAllSelected = options.length > 0 && options.every((opt) => value.includes(opt.value));
  const isIndeterminate = options.length > 0 && selectedCount > 0 && selectedCount < options.length;
  const selectedOptions = options.filter((o) => value.includes(o.value));

  const openDropdown = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 移植元の cdkConnectedOverlay はトリガーの下・左端揃えで、幅をトリガーの offsetWidth に合わせる
    setPanel({ top: rect.bottom, left: rect.left, width: el.offsetWidth });
  };

  const closeDropdown = () => {
    if (isOpen) {
      setPanel(null);
      onFormBlur?.();
    }
  };

  const toggleDropdown = () => {
    if (disabled) return;
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const toggleAll = () => {
    const next = new Set(value);
    if (isAllSelected) {
      options.forEach((opt) => next.delete(opt.value));
    } else {
      options.forEach((opt) => {
        if (!opt.disabled) next.add(opt.value);
      });
    }
    onValueChange?.(Array.from(next));
  };

  const toggleOption = (option: ComboboxOption) => {
    if (option.disabled) return;
    const next = new Set(value);
    if (next.has(option.value)) {
      next.delete(option.value);
    } else {
      next.add(option.value);
    }
    onValueChange?.(Array.from(next));
  };

  const removeOption = (event: MouseEvent<HTMLSpanElement>, option: ComboboxOption) => {
    // チップの削除でドロップダウンが開かないようにする
    event.stopPropagation();
    if (value.includes(option.value)) {
      onValueChange?.(value.filter((v) => v !== option.value));
    }
  };

  const onTriggerKeydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDropdown();
    } else if (event.key === 'Escape') {
      closeDropdown();
    }
  };

  const onActivateKeydown = (event: KeyboardEvent<HTMLDivElement>, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const checkboxClass = (checked: boolean) =>
    cx(
      'w-full h-full rounded-[3px] border flex items-center justify-center transition-colors',
      !checked && 'border-[#C2C2C2] bg-white',
      checked && 'border-[var(--color-primary)] bg-[var(--color-primary)]',
    );

  return (
    <div className={cx('app-form-combobox', className)}>
      <div className="block group">
        {label && (
          <div className="fieldset-head mb-3">
            <p className="fieldset-title">
              {label}
              {badgeText && <span className="fieldset-any">{badgeText}</span>}
            </p>
            {supportText && <p className="fieldset-support-text">{supportText}</p>}
          </div>
        )}
        <div
          ref={triggerRef}
          className={cx(
            'min-h-12 w-full border border-text-lighter/90 bg-white transition-all overflow-hidden rounded-lg',
            error && 'border-error',
            disabled && 'opacity-50 cursor-not-allowed',
            !disabled && 'cursor-pointer',
          )}
        >
          <div
            className="flex items-center w-full min-h-12 p-1.5"
            tabIndex={0}
            role="button"
            onClick={toggleDropdown}
            onKeyDown={onTriggerKeydown}
            aria-disabled={disabled}
            aria-expanded={isOpen}
          >
            <div className="flex-1 flex flex-wrap gap-1.5 pl-2 items-center min-h-8.5">
              {selectedOptions.length === 0 ? (
                <span className="text-sm text-text-lighter">{placeholder}</span>
              ) : (
                selectedOptions.map((option) => (
                  <span
                    key={option.value}
                    className="inline-flex items-center gap-0.5 bg-white border border-text-lighter/90 rounded-full px-2 py-0.5 text-xs text-text-muted leading-none"
                  >
                    {option.label}
                    <span
                      className="mat-icon notranslate material-symbols-outlined text-[16px]! w-4! h-4! text-text-default!"
                      style={CHIP_REMOVE_ICON_STYLE}
                      aria-hidden="true"
                      onClick={(event) => removeOption(event, option)}
                    >
                      cancel
                    </span>
                  </span>
                ))
              )}
            </div>
            <div className="w-px h-8 bg-text-lighter/30 mx-1 shrink-0" />
            <div className="w-8 shrink-0 flex items-center justify-center text-text-lighter">
              <MatIcon name="arrow_drop_down" size={24} className={cx('transition-transform duration-200', isOpen && 'rotate-180')} />
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-error leading-[1.7]">{error}</p>}
      </div>

      {panel && (
        <>
          {/* 移植元の cdk-overlay-transparent-backdrop。外側クリックで閉じる */}
          <div className="fixed inset-0 z-1000" data-testid="form-combobox-backdrop" onClick={closeDropdown} />
          <div
            className="fixed z-1000 bg-white rounded-xl shadow-lg border border-border mt-1 flex flex-col overflow-hidden w-full max-h-80"
            style={{ top: `${panel.top}px`, left: `${panel.left}px`, width: `${panel.width}px` }}
          >
            <div className="flex-1 overflow-y-auto py-1">
              {options.length > 0 ? (
                <>
                  <div
                    className="flex items-center px-4 py-2 hover:bg-surface-light cursor-pointer transition-colors"
                    tabIndex={0}
                    role="button"
                    onClick={toggleAll}
                    onKeyDown={(event) => onActivateKeydown(event, toggleAll)}
                  >
                    <div className="relative flex items-center justify-center w-3.75 h-3.75 mr-3 shrink-0">
                      <div className={checkboxClass(isAllSelected || isIndeterminate)}>
                        {(isAllSelected || isIndeterminate) && (
                          <MatIcon name={isIndeterminate && !isAllSelected ? 'remove' : 'check'} size={14} className="text-white! flex items-center justify-center leading-none" />
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-primary">すべて選択</span>
                  </div>
                  {options.map((option) => {
                    const selected = value.includes(option.value);
                    const rich = Boolean(option.description || option.tag);
                    return (
                      <div
                        key={option.value}
                        className={cx(
                          'flex px-4 py-2.5 hover:bg-surface-light transition-colors',
                          !rich && 'items-center',
                          rich && 'items-start',
                          !option.disabled && 'cursor-pointer',
                          option.disabled && 'cursor-not-allowed opacity-60',
                        )}
                        onClick={() => toggleOption(option)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(event) => onActivateKeydown(event, () => toggleOption(option))}
                      >
                        <div
                          className={cx(
                            'relative flex items-center justify-center w-3.75 h-3.75 mr-3 shrink-0',
                            rich && 'mt-0.5',
                          )}
                        >
                          <div className={checkboxClass(selected)}>
                            {selected && (
                              <MatIcon name="check" size={14} className="text-white! flex items-center justify-center leading-none" />
                            )}
                          </div>
                        </div>
                        <div className={cx('flex flex-col w-full', rich && 'gap-1.5')}>
                          <span className={cx('text-sm text-text-default leading-[1.4]', rich && 'font-medium')}>
                            {option.label}
                          </span>
                          {option.description && (
                            <p className="text-[10px] text-text-muted leading-[1.4] whitespace-normal wrap-break-word">
                              {option.description}
                            </p>
                          )}
                          {option.tag && (
                            <div className="flex mt-0.5">
                              <span className="text-[10px] text-text-muted border border-text-lighter/90 rounded px-1 py-0.5 leading-[1.4]">
                                {option.tag}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-text-muted">検索結果がありません</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
