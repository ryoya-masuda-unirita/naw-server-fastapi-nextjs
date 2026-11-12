import './mat-icon.css';
import { cx } from './class-names';

interface MatIconProps {
  /** material-symbols のアイコン名（例: 'close'、'check_circle'） */
  icon: string;
  className?: string;
}

/**
 * 移植元のテンプレートに直接書かれた `<mat-icon class="...">name</mat-icon>` に相当する。
 * サイズはアイコンフォントの既定（24px）で、className で上書きする。
 */
export function MatIcon({ icon, className }: MatIconProps) {
  return (
    <span
      className={cx('mat-icon notranslate material-symbols-outlined', className)}
      role="img"
      aria-hidden="true"
      data-mat-icon-name={icon}
    >
      {icon}
    </span>
  );
}

/**
 * 移植元 `<app-mat-icon [icon]="...">`（icons/mat-icon.component.ts）。
 * 外側の inline-flex 要素の font-size（`text-[20px]!` など）に合わせてアイコンが 1em で描画される。
 */
export function AppMatIcon({ icon, className }: MatIconProps) {
  return (
    <span className={cx('app-mat-icon inline-flex', className)}>
      <MatIcon icon={icon} />
    </span>
  );
}
