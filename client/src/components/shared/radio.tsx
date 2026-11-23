import type { ReactNode } from 'react';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';

interface RadioProps {
  /** 表示文言（移植元も翻訳せずそのまま出す） */
  label?: string;
  name: string;
  value: string | number;
  disabled?: boolean;
  checked?: boolean;
  /** 移植元の output `handleChange`。選ばれたときに自分の value を通知する */
  onHandleChange?: (value: string | number) => void;
  /** label の前に出す内容（移植元の ng-content） */
  children?: ReactNode;
  className?: string;
}

/** 移植元 `<app-radio>`（shared/components/radio）。見た目は index.css の `.input-radio*` */
export function Radio({
  label = '',
  name,
  value,
  disabled = false,
  checked = false,
  onHandleChange,
  children,
  className,
}: RadioProps) {
  const handleChange = () => {
    if (!disabled) {
      onHandleChange?.(value);
    }
  };

  return (
    <div className={cx('app-radio block', className)}>
      <label className="input-radio my-1">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="input-radio-input"
        />
        <span className="input-radio-visual">
          <span className="input-radio-icon-false" aria-hidden="true">
            <SvgIcon name="radioOff" className="input-radio-icon-svg" />
          </span>
          <span className="input-radio-icon-true" aria-hidden="true">
            <SvgIcon name="radioOn" className="input-radio-icon-svg" />
          </span>
        </span>
        <span className="input-radio-label">
          {children}
          {label}
        </span>
      </label>
    </div>
  );
}
