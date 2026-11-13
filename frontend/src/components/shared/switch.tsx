import type { MouseEvent } from 'react';
import { cx } from './class-names';

type SwitchSize = 'sm' | 'md' | 'lg';

const SWITCH_SIZES: Record<SwitchSize, { track: string; thumb: string; translate: string; iconLine: string }> = {
  sm: { track: 'w-10 h-5', thumb: 'w-4 h-4', translate: 'translate-x-5', iconLine: 'w-2 h-0.5' },
  md: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7', iconLine: 'w-3 h-0.5' },
  lg: { track: 'w-19.5 h-9', thumb: 'w-6 h-6', translate: 'translate-x-10', iconLine: 'w-3.5 h-0.5' },
};

interface SwitchProps {
  checked?: boolean;
  /** 表示文言（移植元も翻訳せずそのまま出す） */
  label?: string;
  disabled?: boolean;
  size?: SwitchSize;
  showIcon?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
}

/** 移植元 `<app-switch>`（shared/components/switch） */
export function Switch({
  checked = false,
  label = '',
  disabled = false,
  size = 'md',
  showIcon = true,
  onCheckedChange,
  className,
}: SwitchProps) {
  const sizes = SWITCH_SIZES[size];

  const toggle = (event: MouseEvent<HTMLSpanElement>) => {
    // 移植元は親の行クリックなどに伝わらないよう止めている
    event.stopPropagation();
    if (!disabled) {
      onCheckedChange?.(!checked);
    }
  };

  return (
    <span
      className={cx('app-switch inline-flex items-center', className)}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={label || undefined}
      onClick={toggle}
    >
      <div
        className={cx(
          'flex items-center gap-3',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer',
        )}
      >
        <div
          className={cx(
            'relative rounded-full transition-all duration-300 ease-in-out',
            sizes.track,
            checked ? 'bg-primary' : 'bg-[#15819a33]',
          )}
        >
          <div
            className={cx(
              'absolute flex items-center justify-center top-1.5 left-1.5 rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out',
              sizes.thumb,
              checked ? sizes.translate : 'translate-x-0',
            )}
          >
            {showIcon &&
              (checked ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 text-primary"
                  aria-hidden="true"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path
                    d="M16.667 5.5L8.333 13.833 3.333 8.833l1.175-1.175 3.825 3.825 6.859-6.859L16.667 5.5z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <span className={cx('bg-primary rounded-full', sizes.iconLine)} />
              ))}
          </div>
        </div>
        {label && (
          <span
            className={cx(
              'select-none text-sm font-medium',
              !disabled && 'text-gray-900',
              disabled && 'text-gray-400',
            )}
          >
            {label}
          </span>
        )}
      </div>
    </span>
  );
}
