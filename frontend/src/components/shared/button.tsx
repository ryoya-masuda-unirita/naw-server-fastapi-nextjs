import type { ReactNode } from 'react';

type ButtonVariant = 'solid' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export function Button({
  children,
  type = 'button',
  variant = 'solid',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  onClick,
}: ButtonProps) {
  const base =
    'relative inline-flex justify-center items-center gap-1 rounded-full border border-solid font-sans font-medium leading-[1.4] whitespace-nowrap transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

  const sizeClass =
    size === 'sm'
      ? 'h-8 px-3 text-[13px]'
      : size === 'lg'
        ? 'h-[54px] px-8 text-btn-large'
        : 'h-10 px-4 text-base';

  const widthClass = fullWidth ? 'w-full' : '';

  const cursorClass = loading
    ? 'cursor-wait'
    : disabled
      ? 'cursor-not-allowed'
      : 'cursor-pointer';

  const variantClass =
    disabled
      ? 'bg-text-disabled border-border-weak text-white opacity-60'
      : variant === 'solid'
        ? 'bg-brand-primary border-brand-primary text-surface-white hover:opacity-90'
        : 'bg-bg-primary border-border-brand text-brand-primary hover:bg-bg-brand-weak';

  const className = [base, sizeClass, widthClass, cursorClass, variantClass]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={className}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden>
          <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
          </svg>
        </span>
      )}
      <span className={`inline-flex items-center gap-1${loading ? ' invisible' : ''}`}>{children}</span>
    </button>
  );
}
