import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { SectionGroup } from '@/types/layout';

interface SidebarHeaderSectionProps {
  section: SectionGroup;
  sidebarCollapsed: boolean;
  onToggle: () => void;
}

// チャット（ルーム一覧）のセクションは開閉しない（移植元と同じ）。ルーム一覧は #285 で足す
const CHAT_SECTION_LABEL_KEY = 'SIDEBAR.CHAT';

/** 移植元 shared/layouts/sidebar/components/sidebar-header-section */
export function SidebarHeaderSection({
  section,
  sidebarCollapsed,
  onToggle,
}: SidebarHeaderSectionProps) {
  const { t } = useTranslation();
  const isChatSection = section.labelKey === CHAT_SECTION_LABEL_KEY;

  const handleHeaderClick = () => {
    if (!isChatSection) {
      onToggle();
    }
  };

  const handleToggleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggle();
  };

  return (
    // 移植元も見出し全体を div のクリックで開閉する（キーボード操作は中の開閉ボタンで行える）
    <div
      onClick={handleHeaderClick}
      className={`flex items-center justify-between px-2 transition-all duration-500 ${
        !sidebarCollapsed && !isChatSection ? 'cursor-pointer' : ''
      } ${sidebarCollapsed ? 'invisible opacity-0' : ''}`}
    >
      <span className="origin-left whitespace-nowrap text-xs font-medium text-text-muted transition-all duration-300">
        {t(section.labelKey)}
      </span>

      {!isChatSection && (
        <button
          type="button"
          aria-label={`toggle-section-${section.labelKey}`}
          aria-expanded={!section.collapsed}
          onClick={handleToggleButtonClick}
          disabled={sidebarCollapsed}
          className="flex h-7! w-7! items-center justify-center rounded-md p-1.5 transition-colors hover:bg-gray-200"
        >
          <span className="flex h-7! w-7! items-center justify-center text-text-lighter">
            <SvgIcon name={section.collapsed ? 'arrowDown' : 'arrowUp'} className="h-5 w-5" />
          </span>
        </button>
      )}
    </div>
  );
}
