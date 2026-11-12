import { ICON_PATHS } from './svg-icon-paths';
import { cx } from './class-names';

export type SvgIconName = keyof typeof ICON_PATHS;

interface SvgIconProps {
  /** `svg-icon-paths.ts` に登録された名前 */
  name: SvgIconName;
  /** 移植元のホスト要素（app-svg-icon）に付けていたクラス。既定は `w-5 h-5` */
  className?: string;
}

/** 移植元 `<app-svg-icon name="...">`。登録済みの 20x20 SVG パスを名前で描画する */
export function SvgIcon({ name, className }: SvgIconProps) {
  const raw = ICON_PATHS[name] ?? '';
  const paths = Array.isArray(raw) ? raw : [raw];
  return (
    <span
      className={cx('flex w-5 h-5 items-center justify-center', className)}
      data-svg-icon-name={name}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="block w-full h-full"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </span>
  );
}
