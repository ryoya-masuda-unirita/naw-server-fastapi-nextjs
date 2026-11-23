import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './host-selectors.css';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';

interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  /** i18n キー */
  label?: string;
  /** ヘッダー行（全選択）用。中間状態のアイコンが全選択用になる */
  isHeader?: boolean;
  /**
   * 移植元はクリックで `checked` を反転して通知する（中間状態からは必ず true）。
   * 状態は親が持ち、ここで受け取った値を checked に戻す。
   */
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

/** 移植元 `<app-checkbox>`（shared/components/checkbox）。見た目は index.css の `.input-checkbox-*` */
export function Checkbox({
  checked = false,
  indeterminate = false,
  label = '',
  isHeader = false,
  onCheckedChange,
  className,
}: CheckboxProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  // indeterminate は HTML 属性ではなく DOM プロパティなので ref で設定する
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate && !checked;
    }
  }, [indeterminate, checked]);

  const toggle = () => {
    if (indeterminate) {
      onCheckedChange?.(true);
    } else {
      onCheckedChange?.(!checked);
    }
  };

  return (
    <span
      className={cx('app-checkbox inline-flex items-center gap-2 cursor-pointer', className)}
      role="checkbox"
      aria-checked={indeterminate && !checked ? 'mixed' : checked}
      aria-label={label ? t(label) : undefined}
      onClick={toggle}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="input-checkbox-input"
        checked={checked}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
      />
      <span className="input-checkbox-visual">
        <span className="input-checkbox-icon-false" aria-hidden="true">
          <SvgIcon name="selectedFlase" className="input-checkbox-icon-svg" />
        </span>
        <span className="input-checkbox-icon-true" aria-hidden="true">
          <SvgIcon name="selectedTrue" className="input-checkbox-icon-svg" />
        </span>
        <span className="input-checkbox-icon-indeterminate" aria-hidden="true">
          <SvgIcon
            name={isHeader ? 'checkboxAll' : 'selectedIndeterminate'}
            className="input-checkbox-icon-svg"
          />
        </span>
      </span>
      {label && <span className="select-none text-sm">{t(label)}</span>}
    </span>
  );
}
