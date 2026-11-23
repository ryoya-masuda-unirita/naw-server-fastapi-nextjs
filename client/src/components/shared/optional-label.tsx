import { useTranslation } from 'react-i18next';
import { cx } from './class-names';

interface OptionalLabelProps {
  className?: string;
}

/** 移植元 `<app-optional-label>`（shared/components/labels）。入力項目の「任意」ラベル */
export function OptionalLabel({ className }: OptionalLabelProps) {
  const { t } = useTranslation();
  return (
    <span className={cx('app-optional-label inline-flex', className)}>
      <span className="text-[10px] font-medium text-text-muted px-1 py-0.5 rounded-sm bg-bg-secondary">
        {t('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.OPTIONAL')}
      </span>
    </span>
  );
}
