import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './host-selectors.css';
import { cx } from './class-names';
import { SvgIcon } from './icons/svg-icon';

interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  /** i18n キー */
  label?: string;
  /** 見える文字（label）がないときの、読み上げ用の名前（i18n キー）。表の行頭の選択など */
  ariaLabel?: string;
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
  ariaLabel,
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

  // キーボード（Space）でも切り替えられるようにする。中の input は見た目用で操作しない
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    toggle();
  };

  const accessibleName = label ? t(label) : ariaLabel ? t(ariaLabel) : undefined;

  return (
    <span
      className={cx('app-checkbox inline-flex items-center gap-2 cursor-pointer', className)}
      role="checkbox"
      tabIndex={0}
      aria-checked={indeterminate && !checked ? 'mixed' : checked}
      aria-label={accessibleName}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="input-checkbox-input"
        checked={checked}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        // role=checkbox の中に操作できる要素を入れ子にしない（axe: nested-interactive）
        inert
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
