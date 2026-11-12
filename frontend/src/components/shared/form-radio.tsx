import { useId } from 'react';
import './form-radio.css';
import { cx } from './class-names';
import { MatIcon } from './mat-icon';
import { SvgIcon } from './svg-icon';

export interface FormRadioOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
  /** その選択肢の input に付ける data-testid */
  testid?: string;
}

interface FormRadioProps<T> {
  /** 表示済みの文言（移植元も翻訳せずそのまま出す） */
  label?: string;
  badgeText?: string;
  supportText?: string;
  disabled?: boolean;
  error?: string;
  warning?: string;
  options: FormRadioOption<T>[];
  layout?: 'horizontal' | 'vertical';
  /** ラジオの name。省略すると部品ごとに一意な名前を使う */
  name?: string;
  value?: T | null;
  /** 各選択肢の label に足すクラス */
  inputClass?: string;
  /** 選択肢の並びの gap などを上書きするクラス */
  classOption?: string;
  className?: string;
  onValueChange?: (value: T) => void;
  onFormBlur?: () => void;
}

/** 移植元 `<app-form-radio>`（shared/components/form/form-radio） */
export function FormRadio<T = string>({
  label = '',
  badgeText = '',
  supportText = '',
  disabled = false,
  error = '',
  warning = '',
  options,
  layout = 'horizontal',
  name = '',
  value = null,
  inputClass = '',
  classOption = '',
  className,
  onValueChange,
  onFormBlur,
}: FormRadioProps<T>) {
  // 移植元は Math.random で一意な name を作る。React では useId で同じ役割を果たす
  const uniqueName = `radio-${useId()}`;

  const handleSelect = (next: T) => {
    if (disabled) return;
    onValueChange?.(next);
  };

  return (
    <div className={cx('app-form-radio block', className)}>
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
          <div className="flex items-center gap-1 mb-3 text-status-caution">
            <MatIcon icon="warning" className="icon-20" />
            <p className="text-xs font-normal leading-[1.4]">{warning}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-1 mb-3 text-status-error">
            <MatIcon icon="warning" className="icon-20" />
            <p className="text-xs font-normal leading-[1.4]">{error}</p>
          </div>
        )}
        <div
          className={cx(
            'flex w-full',
            layout === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
            classOption ? classOption : layout === 'horizontal' ? 'gap-4' : 'gap-3',
          )}
        >
          {options.map((option) => {
            const isChecked = value === option.value;
            const isOptionDisabled = disabled || Boolean(option.disabled);
            return (
              <label
                key={String(option.value)}
                className={cx(
                  'input-radio' + (inputClass ? ` ${inputClass}` : ''),
                  isOptionDisabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {isChecked ? (
                  <SvgIcon
                    name="radioOn"
                    className={cx('w-5 h-5', isOptionDisabled ? 'text-text-medium' : 'text-brand-primary')}
                  />
                ) : (
                  <SvgIcon name="radioOff" className="w-5 h-5 text-text-medium" />
                )}
                <input
                  type="radio"
                  name={name || uniqueName}
                  value={String(option.value)}
                  checked={isChecked}
                  disabled={isOptionDisabled}
                  data-testid={option.testid}
                  onChange={() => handleSelect(option.value)}
                  onBlur={() => onFormBlur?.()}
                  className="hidden"
                />
                <span className="text-sm text-text-default leading-[1.4] font-medium">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
