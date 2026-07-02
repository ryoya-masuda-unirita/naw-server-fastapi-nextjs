import { useState } from 'react';

interface FormInputProps {
  label?: string;
  supportText?: string;
  error?: string;
  type?: 'text' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  id?: string;
}

export function FormInput({
  label,
  supportText,
  error,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  autoComplete,
  id,
}: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputType = type === 'password' && showPassword ? 'text' : type;
  const hasValue = value.length > 0 && !isFocused;

  const wrapperClass = [
    'trigger-wrapper relative flex items-center w-full rounded-lg text-body font-normal transition-all duration-200 h-12',
    error ? 'bg-bg-error has-error' : '',
    disabled ? 'is-disabled' : '',
    !error && !disabled && hasValue ? 'bg-bg-brand-weak' : '',
    !error && !disabled && !hasValue ? 'bg-white' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-3">
      {(label || supportText) && (
        <div className="fieldset-head">
          {label && (
            <label htmlFor={id} className="fieldset-title">
              {label}
            </label>
          )}
          {supportText && <p className="fieldset-support-text">{supportText}</p>}
        </div>
      )}

      {error && (
        <p className="text-xs font-normal leading-[1.4] text-status-error">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <div className={wrapperClass}>
          <input
            id={id}
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-body leading-[1.7] text-text-strong placeholder:text-text-weak placeholder:font-extralight disabled:cursor-not-allowed disabled:opacity-50 h-12 px-4 truncate"
          />

          {type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-weak mr-2"
              aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
