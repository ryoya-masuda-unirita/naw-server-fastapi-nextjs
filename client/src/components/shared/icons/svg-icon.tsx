import { ICON_PATHS, type SvgIconName } from './svg-icon-paths';

interface SvgIconProps {
  name: SvgIconName;
  className?: string;
}

/** 移植元 app-svg-icon。外側の span は移植元の host クラス（flex w-5 h-5 ...）に呼び出し側のクラスを足したもの */
export function SvgIcon({ name, className = '' }: SvgIconProps) {
  const raw: string | readonly string[] = ICON_PATHS[name];
  const paths = typeof raw === 'string' ? [raw] : raw;

  return (
    <span className={`flex h-5 w-5 items-center justify-center ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="block h-full w-full"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}
