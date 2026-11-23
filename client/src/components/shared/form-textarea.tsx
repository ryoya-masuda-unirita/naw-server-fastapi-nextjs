import type { ChangeEvent } from 'react';
import { cx } from './class-names';

interface FormTextareaProps {
  /** 表示済みの文言（移植元も翻訳せずそのまま出す） */
  label: string;
  badgeText?: string;
  supportText?: string;
  placeholder?: string;
  /** textarea に足すクラス */
  textareaClass?: string;
  value: string;
  disabled?: boolean;
  error?: string;
  rows?: number;
  textareaId?: string;
  /** 最小の高さ（px） */
  areaHeight?: number;
  className?: string;
  onValueChange?: (value: string) => void;
  onFormBlur?: () => void;
}

/**
 * 移植元 `<app-form-textarea>`（shared/components/form/form-textarea）。
 * 移植元の maxLength 入力はテンプレートで使われていないため移していない。
 */
export function FormTextarea({
  label,
  badgeText = '',
  supportText = '',
  placeholder = '',
  textareaClass = '',
  value,
  disabled = false,
  error = '',
  rows = 4,
  textareaId = '',
  areaHeight,
  className,
  onValueChange,
  onFormBlur,
}: FormTextareaProps) {
  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange?.(event.target.value);
  };

  return (
    <div className={cx('app-form-textarea', className)}>
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
        <div className="relative flex w-full">
          <textarea
            id={textareaId || undefined}
            value={value}
            onChange={handleInput}
            onBlur={() => onFormBlur?.()}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            aria-label={label || undefined}
            style={areaHeight !== undefined ? { minHeight: `${areaHeight}px` } : undefined}
            className={cx(
              'w-full block px-4 py-3 border border-border rounded-lg text-sm text-text-default placeholder:text-text-lighter leading-[1.7] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all resize-vertical',
              textareaClass,
              error && 'border-error',
              !error && 'focus:border-[var(--color-primary)]',
            )}
          />
        </div>
        {error && <p className="text-xs text-error leading-[1.7]">{error}</p>}
      </div>
    </div>
  );
}
