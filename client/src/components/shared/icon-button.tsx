import type { ChangeEvent, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './class-names';

export type IconButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'primary-gray'
  | 'secondary-gray'
  | 'tertiary-gray';
export type IconButtonSize = 'default' | 'thin' | 'large' | 'largePc';
export type IconButtonType = 'button' | 'submit' | 'file' | 'icon';

const SIZE_CLASS: Record<IconButtonSize, string> = {
  default: 'w-7 h-7',
  thin: 'w-5 h-5',
  large: 'w-9 h-9',
  largePc: 'w-7 h-7 md:w-9 md:h-9',
};

interface IconButtonProps {
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** 'file' はファイル選択、'icon' はクリックできる div、ほかは `<button>` で描画する */
  type?: IconButtonType;
  disabled?: boolean;
  /** type='file' のとき複数選択を許可する */
  multiple?: boolean;
  /** 指定すると `<Link>` で描画する */
  link?: string;
  ariaLabel?: string;
  classProps?: string;
  /** 移植元のホスト要素（app-icon-button）に付けていたクラス */
  className?: string;
  dataTestid?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onFileChange?: (files: FileList) => void;
}

/** 移植元 `<app-icon-button>`（shared/components/icon-button）。見た目は index.css の `.icon-button*` */
export function IconButton({
  children,
  variant = 'primary',
  size = 'default',
  type = 'button',
  disabled = false,
  multiple = false,
  link = '',
  ariaLabel = '',
  classProps = '',
  className,
  dataTestid,
  onClick,
  onFileChange,
}: IconButtonProps) {
  const hostClass = `icon-button icon-button-${variant} ${SIZE_CLASS[size]} ${classProps}`;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!disabled) {
      onClick?.(event);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      onFileChange?.(files);
    }
  };

  let content: ReactNode;
  if (type === 'file') {
    content = (
      <label className={cx(hostClass, disabled && 'pointer-events-none opacity-50')}>
        <input
          type="file"
          className="sr-only"
          disabled={disabled}
          multiple={multiple}
          onChange={handleFileChange}
        />
        <span className="pointer-events-none flex items-center justify-center w-full h-full" aria-hidden="true">
          {children}
        </span>
      </label>
    );
  } else if (link) {
    content = (
      <Link
        to={link}
        className={cx(hostClass, disabled && 'pointer-events-none opacity-50')}
        aria-label={ariaLabel || undefined}
        data-testid={dataTestid}
        onClick={handleClick}
      >
        {children}
      </Link>
    );
  } else if (type === 'icon') {
    content = (
      <div className={hostClass} data-testid={dataTestid} onClick={handleClick}>
        {children}
      </div>
    );
  } else {
    content = (
      <button
        type={type === 'submit' ? 'submit' : 'button'}
        className={hostClass}
        disabled={disabled}
        aria-label={ariaLabel || undefined}
        data-testid={dataTestid}
        onClick={handleClick}
      >
        {children}
      </button>
    );
  }

  return <span className={cx('inline-flex', className)}>{content}</span>;
}
