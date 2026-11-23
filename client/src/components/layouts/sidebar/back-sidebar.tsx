import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { useUiStore } from '@/store/ui-store';

interface BackSidebarProps {
  onGoToBack: () => void;
}

/** 移植元 layouts/admin-layout/components/back-sidebar（ライブラリ詳細などで出す「戻る」だけのサイドバー） */
export function BackSidebar({ onGoToBack }: BackSidebarProps) {
  const { t } = useTranslation();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);

  return (
    <button
      type="button"
      onClick={onGoToBack}
      className="flex h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-text-default transition-colors hover:bg-bg-brand-weak"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <MatIcon name="keyboard_return" />
        </span>
      </span>
      {!sidebarCollapsed && <span>{t('ADMIN.LIBRARY.BACK')}</span>}
    </button>
  );
}
