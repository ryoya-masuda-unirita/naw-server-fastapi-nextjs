import { useTranslation } from 'react-i18next';
import { cx } from './class-names';

type LoadingSize = 'sm' | 'md' | 'lg';

const GAP_CLASS: Record<LoadingSize, string> = {
  sm: 'gap-3',
  md: 'gap-6',
  lg: 'gap-8',
};

/** ロゴ画像の表示サイズ（px）。移植元はサイズ指定にかかわらず 48px 固定 */
const LOGO_SIZE = 48;

interface LoadingProps {
  /** i18n キー */
  message?: string;
  showMessage?: boolean;
  /** メッセージとロゴの間隔を変える（移植元はロゴの大きさには使っていない） */
  size?: LoadingSize;
  logoSrc?: string;
  /** 移植元にある input だがテンプレートでは使われていない。互換のため受け取るだけ */
  padding?: string;
  className?: string;
}

/** 移植元 `<app-loading>`（shared/components/loading）。ロゴと「読み込み中…」を中央に出す */
export function Loading({
  message = 'CHAT.LOADING',
  showMessage = true,
  size = 'md',
  logoSrc = '/logo-min.svg',
  className,
}: LoadingProps) {
  const { t } = useTranslation();
  return (
    <div className={cx('app-loading flex items-center justify-center', className)}>
      <div className={cx('flex flex-col items-center md:pt-10 mt-14', GAP_CLASS[size])}>
        <img src={logoSrc} alt="Loading" width={LOGO_SIZE} height={LOGO_SIZE} className="w-12! h-12!" />
        {showMessage && <h3 className="text-h5 text-text-medium font-medium">{t(message)}</h3>}
      </div>
    </div>
  );
}
