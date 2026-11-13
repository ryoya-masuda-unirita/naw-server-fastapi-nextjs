import { cx } from './class-names';

/** 円グラフの半径（viewBox 120 の中での値。移植元と同じ） */
const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_PERCENTAGE = 100;

interface CircularProgressProps {
  current: number;
  limit: number;
  /** 移植元は日本語をハードコードしている（既定値もそのまま） */
  label?: string;
  className?: string;
}

/** 移植元 `<app-circular-progress>`（shared/components/circular-progress）。使用量 / 上限の円グラフ */
export function CircularProgress({ current, limit, label = '今月の使用量', className }: CircularProgressProps) {
  const percentage = limit > 0 ? Math.min((current / limit) * MAX_PERCENTAGE, MAX_PERCENTAGE) : 0;
  const strokeDasharray = `${(percentage / MAX_PERCENTAGE) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;

  return (
    // 移植元の component SCSS（:host { display: flex }）はホストクラスの flex と同じなので CSS ファイルは作らない
    <div className={cx('app-circular-progress flex items-center justify-center', className)}>
      <div className="relative w-[168px] h-[168px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#e5e5e5" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <div className="flex flex-col items-center pb-px">
            <p className="text-[10px] font-medium text-text-muted leading-[1.4] text-center">{label}</p>
            <div className="flex items-baseline justify-center mb-[-1px]">
              <p className="text-[20px] font-medium text-[#1a1a1a] leading-[1.4]">{current.toLocaleString('ja-JP')}</p>
            </div>
          </div>
          <p className="text-[12px] font-medium text-text-muted leading-[1.4] text-center">
            上限{limit.toLocaleString('ja-JP')}
          </p>
        </div>
      </div>
    </div>
  );
}
