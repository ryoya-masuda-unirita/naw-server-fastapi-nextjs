import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import './host-selectors.css';
import { cx } from './class-names';

export type ButtonVariant = 'solid' | 'outline' | 'text' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'largePcDefault';
export type ButtonType = 'button' | 'submit' | 'reset';
export type ButtonIntent = 'default' | 'cancel' | 'delete';

interface ButtonProps {
  children?: ReactNode;
  type?: ButtonType;
  variant?: ButtonVariant;
  size?: ButtonSize;
  intent?: ButtonIntent;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** 移植元の `<mat-icon icon>`（`[icon]` スロット）に相当するアイコン */
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  /** size の高さを上書きする（例: ログインの 54px） */
  heightPx?: number;
  /** 内部の `<button>` に足すクラス（移植元の classProps） */
  classProps?: string;
  /** 移植元のホスト要素（app-button）に付けていたクラス */
  className?: string;
  /** 内部の `<button>` に付ける data-testid */
  dataTestid?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const BASE_CLASS =
  'relative inline-flex justify-center items-center gap-1 rounded-full border border-solid font-sans font-medium leading-[1.4] whitespace-nowrap no-underline transition-all duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const DANGER_CLASS =
  'bg-status-error border-status-error text-white hover:bg-[color-mix(in_srgb,var(--color-status-error)_90%,black)] hover:border-[color-mix(in_srgb,var(--color-status-error)_90%,black)] active:bg-[color-mix(in_srgb,var(--color-status-error)_80%,black)] focus-visible:outline-status-error';

function getSizeClass(size: ButtonSize): string {
  if (size === 'sm') return 'h-8 px-3 py-1.5 text-[13px]';
  if (size === 'md') return 'h-10 px-4 py-2 text-base';
  if (size === 'largePcDefault') return 'h-[54px] px-8 text-btn-large md:min-w-16 md:h-9 md:px-3';
  return 'h-[54px] px-8 text-btn-large';
}

function getVariantClass(variant: ButtonVariant, intent: ButtonIntent): string {
  if (variant === 'solid') {
    if (intent === 'cancel') {
      return 'bg-bg-button-gray border-bg-button-gray text-text-medium hover:bg-bg-button-gray-hover hover:border-bg-button-gray-hover active:bg-border-strong active:border-border-strong';
    }
    if (intent === 'delete') return DANGER_CLASS;
    return 'bg-brand-primary border-brand-primary text-surface-white hover:opacity-90';
  }
  if (variant === 'outline') {
    if (intent === 'cancel') {
      return 'bg-surface-white border-border-strong text-text-medium hover:bg-bg-secondary active:bg-border-strong/20';
    }
    if (intent === 'delete') {
      return 'bg-surface-white border-status-error text-status-error hover:bg-bg-error active:bg-bg-error';
    }
    return 'bg-bg-primary border-border-brand text-brand-primary hover:bg-bg-brand-weak hover:border-brand-secondary hover:text-brand-secondary active:bg-bg-brand-weak/80 disabled:border-border-weak disabled:text-text-disabled';
  }
  if (variant === 'danger') return DANGER_CLASS;
  if (intent === 'cancel') {
    return 'border-transparent bg-transparent text-text-medium hover:bg-bg-secondary active:bg-border-strong/20';
  }
  if (intent === 'delete') {
    return 'border-transparent bg-transparent text-status-error hover:bg-bg-error active:bg-bg-error';
  }
  return 'border-transparent bg-transparent text-primary hover:bg-primary/5 active:bg-[rgba(41,115,143,0.1)]';
}

/** 移植元 `<app-button>`（shared/components/button） */
export function Button({
  children,
  type = 'button',
  variant = 'solid',
  size = 'md',
  intent = 'default',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'right',
  heightPx,
  classProps = '',
  className,
  dataTestid,
  onClick,
}: ButtonProps) {
  const cursorClass = loading ? 'cursor-wait' : disabled ? 'cursor-not-allowed!' : 'cursor-pointer';
  const widthClass = fullWidth ? 'w-full' : '';
  // 移植元は disabled のとき classProps を付けない
  const buttonClass = disabled
    ? cx(
        BASE_CLASS,
        getSizeClass(size),
        cursorClass,
        widthClass,
        'bg-text-disabled text-white text-slate-300 border border-border-weak',
      )
    : cx(
        classProps,
        BASE_CLASS,
        getSizeClass(size),
        cursorClass,
        widthClass,
        getVariantClass(variant, intent),
      );
  const style: CSSProperties | undefined = heightPx !== undefined ? { height: `${heightPx}px` } : undefined;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      onClick?.(event);
    }
  };

  return (
    <span className={cx('app-button inline-block', className)}>
      <button
        type={type}
        data-testid={dataTestid}
        className={buttonClass}
        style={style}
        disabled={disabled || loading}
        onClick={handleClick}
      >
        {loading && (
          <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden="true">
            <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="31.4 31.4"
              />
            </svg>
          </span>
        )}
        <span className={cx('inline-flex items-center gap-1', loading && 'invisible')}>
          <span
            className={cx(
              'button-icon-slot inline-flex size-5 items-center justify-center empty:hidden [&_svg]:size-full',
              iconPosition === 'left' ? 'order-0' : 'order-2',
            )}
          >
            {icon}
          </span>
          <span className="inline-flex items-center order-1 gap-1">{children}</span>
        </span>
      </button>
    </span>
  );
}
