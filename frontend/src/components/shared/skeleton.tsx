import { cx } from './class-names';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  /** 角丸のクラス。variant が 'rect' のときだけ使う */
  rounded?: string;
  className?: string;
}

/** 移植元 `<app-skeleton>`（shared/components/skeleton）。読み込み中のプレースホルダー */
export function Skeleton({ variant = 'rect', width = '100%', height = '1rem', rounded = 'rounded', className }: SkeletonProps) {
  const shape = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded' : rounded;
  return (
    <span
      className={cx(`app-skeleton block bg-gray-200 animate-pulse shrink-0 ${shape}`, className)}
      style={{ width, height }}
    />
  );
}

interface SkeletonBlockProps {
  /** 行数 */
  length: number;
  className?: string;
}

/** 移植元 `<app-skeleton-block>`。アイコン・テキスト・丸の 3 つを並べた行を length 行出す */
export function SkeletonBlock({ length, className }: SkeletonBlockProps) {
  const rows = Array.from({ length }, (_, i) => i);
  return (
    <div className={cx('app-skeleton-block flex flex-col gap-1', className)}>
      {rows.map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton width="1.25rem" height="1.25rem" />
          <Skeleton variant="text" height="1rem" />
          <Skeleton variant="circle" width="1.25rem" height="1.25rem" />
        </div>
      ))}
    </div>
  );
}
