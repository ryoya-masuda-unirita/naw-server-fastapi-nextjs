import './app-mat-icon.css';
import { cx } from '../class-names';

interface AppMatIconProps {
  /** material-symbols のアイコン名 */
  icon: string;
  /** 移植元のホスト要素（app-mat-icon）に付けていたクラス。`text-[20px]!` などの font-size でアイコンの大きさが決まる */
  className?: string;
}

/**
 * 移植元 `<app-mat-icon [icon]="...">`。外側の inline-flex 要素の font-size に合わせて、アイコンを 1em で描画する。
 * 大きさを px で渡す `<mat-icon>` 相当は `MatIcon`（./mat-icon）。
 */
export function AppMatIcon({ icon, className }: AppMatIconProps) {
  return (
    <span className={cx('app-mat-icon inline-flex', className)}>
      <span className="mat-icon notranslate material-symbols-outlined" role="img" aria-hidden="true">
        {icon}
      </span>
    </span>
  );
}
