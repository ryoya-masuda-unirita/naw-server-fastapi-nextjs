import { useState, type ChangeEvent, type ReactNode } from 'react';
import './form-input.css';
import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import { SvgIcon } from './icons/svg-icon';

/** asciiOnly のとき残す文字（印字可能な ASCII）以外 */
const NON_PRINTABLE_ASCII = /[^\x20-\x7E]/g;

interface FormInputProps {
  /** 表示済みの文言（翻訳は呼び出し側で行う。移植元も翻訳せずそのまま出す） */
  label?: string;
  /** ラベル右のバッジ（例: 任意） */
  badgeText?: string;
  supportText?: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** 入力できる最大文字数。超えた分は切り捨てて通知する */
  maxLength?: number | null;
  error?: string;
  warning?: string;
  /** 移植元の autocomplete。既存呼び出し互換で autoComplete も受ける */
  autocomplete?: string;
  autoComplete?: string;
  /** type='password' のとき表示切替ボタンを出す */
  showPasswordToggle?: boolean;
  /** 印字可能な ASCII 以外を入力から取り除く */
  asciiOnly?: boolean;
  /** ラベルの for と input の id。既存呼び出し互換で id も受ける */
  inputId?: string;
  id?: string;
  /** 入力欄の右側に置く要素（移植元の endAdornment テンプレート） */
  endAdornment?: ReactNode;
  /** 内部の input の data-testid。エラー文言には `${dataTestid}-error` を付ける */
  dataTestid?: string;
  required?: boolean;
  className?: string;
  /** 移植元の valueChange */
  onValueChange?: (value: string) => void;
  /** 既存呼び出し（login / pw-reset）互換。onValueChange と同じタイミングで呼ぶ */
  onChange?: (value: string) => void;
  /** 移植元の formBlur */
  onFormBlur?: () => void;
}

/** 移植元 `<app-form-input>`（shared/components/form/form-input） */
export function FormInput({
  label = '',
  badgeText = '',
  supportText = '',
  placeholder = '',
  type = 'text',
  value,
  disabled = false,
  readOnly = false,
  maxLength = null,
  error = '',
  warning = '',
  autocomplete,
  autoComplete,
  showPasswordToggle = false,
  asciiOnly = false,
  inputId,
  id,
  endAdornment,
  dataTestid,
  required,
  className,
  onValueChange,
  onChange,
  onFormBlur,
}: FormInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const resolvedId = inputId ?? id ?? '';
  const inputType = type === 'password' && showPassword ? 'text' : type;
  const hasValue = Boolean(value) && !isFocused;
  const errorTestid = dataTestid ? `${dataTestid}-error` : undefined;

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    let next = event.target.value;
    if (asciiOnly) {
      next = next.replace(NON_PRINTABLE_ASCII, '');
    }
    if (maxLength !== null && next.length > maxLength) {
      next = next.slice(0, maxLength);
    }
    onValueChange?.(next);
    onChange?.(next);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFormBlur?.();
  };

  return (
    <div className={cx('app-form-input', className)}>
      <div className="flex flex-col gap-3">
        {(label || supportText) && (
          <div className="fieldset-head">
            {label && (
              <label htmlFor={resolvedId || undefined} className="fieldset-title">
                {label}
                {badgeText && <span className="fieldset-any">{badgeText}</span>}
              </label>
            )}
            {supportText && <p className="fieldset-support-text">{supportText}</p>}
          </div>
        )}
        {warning && (
          <div className="flex items-center gap-1 text-status-caution mb-3">
            <SvgIcon name="alert" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]">{warning}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-1 md:mt-1 text-status-error mb-3">
            <AppMatIcon icon="warning" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]" data-testid={errorTestid}>
              {error}
            </p>
          </div>
        )}
        <div className="flex gap-3 items-center">
          <div
            className={cx(
              'trigger-wrapper relative flex items-center w-full rounded-lg text-body font-normal transition-all duration-200 h-12',
              hasValue && 'has-value',
              hasValue && !error && !disabled && 'bg-bg-brand-weak',
              error && 'bg-bg-error',
              !error && !disabled && 'bg-white',
              disabled && 'is-disabled',
              error && 'has-error',
            )}
          >
            <input
              // 移植元の input には id がなくラベルと結び付いていない。ラベルから入力欄を辿れるよう id を付ける
              id={resolvedId || undefined}
              type={inputType}
              data-testid={dataTestid}
              value={value}
              onChange={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              required={required}
              autoComplete={autocomplete ?? autoComplete ?? ''}
              maxLength={maxLength ?? undefined}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-body leading-[1.7] text-text-strong placeholder:text-text-weak placeholder:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 text-ellipsis h-12 px-4 placeholder:font-extralight!"
            />
            {showPasswordToggle && type === 'password' && (
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-lighter"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <AppMatIcon icon={showPassword ? 'visibility' : 'visibility_off'} className="text-[20px]!" />
              </button>
            )}
          </div>
          {endAdornment}
        </div>
      </div>
    </div>
  );
}
