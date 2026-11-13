import './form-select.css';
import { cx } from './class-names';
import { AppMatIcon } from './icons/app-mat-icon';
import { Select } from './select';
import type { SelectOption } from './types';

export interface FormSelectProps<T = string> {
  /** 見出し（翻訳済みの文言を渡す） */
  label: string;
  /** 見出し横のバッジ（「任意」など） */
  badgeText?: string;
  supportText?: string;
  /** 空文字以外なら警告アイコン付きで表示し、セレクトをエラー表示にする */
  error?: string;
  /** 空文字以外なら注意色で表示する */
  warning?: string;
  /** 移植元にあるが描画には使われていない */
  inputId?: string;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'small';
  width?: string;
  /** ドロップダウン上部の補足（Select の supportText） */
  dropdownSupportText?: string;
  value?: T | null;
  classNameInputSelect?: string;
  /** 値が変わったとき（選択・クリア）。移植元の `(valueChange)` / ControlValueAccessor の onChange */
  onValueChange?: (value: T | null) => void;
  /** 値が変わった直後に呼ぶ。移植元の `(formBlur)`（touched にする用途） */
  onFormBlur?: () => void;
  className?: string;
}

/** 移植元 `<app-form-select>`（shared/components/form/form-select）。見出し・補足・エラー付きの Select */
export function FormSelect<T = string>({
  label,
  badgeText = '',
  supportText = '',
  error = '',
  warning = '',
  options,
  placeholder = '選択してください',
  disabled = false,
  size = 'default',
  width = '240px',
  dropdownSupportText = '',
  value = null,
  classNameInputSelect = '',
  onValueChange,
  onFormBlur,
  className,
}: FormSelectProps<T>) {
  const handleSelectChange = (next: T | null) => {
    onValueChange?.(next);
    onFormBlur?.();
  };

  return (
    <div className={cx('app-form-select', className)}>
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
        {warning && (
          <div className="flex items-center gap-1 md:mt-1 text-status-caution mb-3">
            <AppMatIcon icon="warning" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]">{warning}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-1 md:mt-1 text-status-error mb-3">
            <AppMatIcon icon="warning" className="text-xl!" />
            <p className="text-xs font-normal leading-[1.4]">{error}</p>
          </div>
        )}
        <div className={cx('form-select-wrapper w-full', !!error && 'has-error')}>
          <Select<T>
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            size={size}
            width={width}
            supportText={dropdownSupportText}
            value={value}
            onValueChange={handleSelectChange}
            classNameInputSelect={classNameInputSelect}
          />
        </div>
      </div>
    </div>
  );
}
