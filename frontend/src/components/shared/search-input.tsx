import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';
import { useIsMobile } from './use-is-mobile';

/** 移植元と同じく size='small' のデスクトップでは幅 160px に固定する */
const SMALL_DESKTOP_WIDTH = '160px';

interface SearchInputProps {
  size?: 'default' | 'small';
  value?: string;
  /** i18n キー */
  placeholder?: string;
  /** i18n キー */
  ariaLabel?: string;
  showSearchIcon?: boolean;
  showClearButton?: boolean;
  /** input に足すクラス */
  inputClass?: string;
  /** 内部の input の data-testid */
  dataTestid?: string;
  className?: string;
  /** 移植元の valueChange（クリア時は '' を通知する） */
  onValueChange?: (value: string) => void;
  /** 移植元の cleared */
  onCleared?: () => void;
}

/**
 * 移植元 `<app-search-input>`（shared/components/input/search-input）。
 * 移植元の maxLength・searchClick はテンプレートで使われていないため移していない。
 */
export function SearchInput({
  size = 'default',
  value = '',
  placeholder = '',
  ariaLabel = '',
  showSearchIcon = true,
  showClearButton = true,
  inputClass = '',
  dataTestid,
  className,
  onValueChange,
  onCleared,
}: SearchInputProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isFocused, setIsFocused] = useState(false);
  const hostWidth = size === 'small' && !isMobile ? SMALL_DESKTOP_WIDTH : '100%';

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(event.target.value);
  };

  const handleClear = () => {
    onValueChange?.('');
    onCleared?.();
  };

  return (
    <div className={cx('app-search-input block', className)} style={{ width: hostWidth }}>
      <div className="relative block w-full group">
        <input
          data-testid={dataTestid}
          className={cx(
            'input-parts-field type-search library-search-field truncate w-full md:w-40 text-text-default',
            size !== 'small' && 'h-12 px-4 text-sm',
            size === 'small' && 'h-9 pl-3 text-xs',
            size === 'small' && value !== '' && 'pr-17',
            Boolean(value) && !isFocused && 'text-brand-secondary',
            inputClass,
          )}
          value={value}
          onChange={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder ? t(placeholder) : ''}
          aria-label={ariaLabel ? t(ariaLabel) : undefined}
        />
        {showClearButton && value && (
          <button type="button" className="combobox-clear" onClick={handleClear} aria-label={t('COMMON.CLEAR')}>
            <SvgIcon name="close" className="shrink-0 w-3! h-3! transition-colors duration-200 text-text-white!" />
          </button>
        )}
        {showSearchIcon && (
          <div
            className="absolute top-1/2 -translate-y-1/2 right-3 w-5 h-5 flex items-center justify-center pointer-events-none text-text-weak transition-colors duration-200 group-focus-within:text-brand-primary"
            aria-hidden="true"
          >
            <SvgIcon
              name="search"
              className={cx(
                'shrink-0 w-5! h-5! text-current transition-colors duration-200',
                Boolean(value) && 'text-brand-primary!',
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
