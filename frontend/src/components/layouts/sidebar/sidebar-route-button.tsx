import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { SvgIconName } from '@/components/shared/icons/svg-icon-paths';
import type { MenuItem } from '@/types/layout';

interface SidebarRouteButtonProps {
  item: MenuItem & { route: string };
  sidebarCollapsed: boolean;
}

/**
 * 移植元 shared/layouts/sidebar/components/sidebar-route-button。
 * ピン・ルームの操作メニュー・バッジ（hasPin・hasMenu・badge）はルーム一覧用のため #285 で足す。
 */
export function SidebarRouteButton({ item, sidebarCollapsed }: SidebarRouteButtonProps) {
  const { t } = useTranslation();

  return (
    <NavLink
      to={item.route}
      title={t(item.labelKey)}
      data-testid={item.roomId ? 'chat-history-item' : undefined}
      className={({ isActive }) =>
        `group flex h-9 items-center gap-2 rounded-lg px-2 py-2 text-xs font-normal text-text-default transition-colors hover:bg-bg-brand-weak ${
          isActive ? 'group-active bg-bg-brand-strong! text-primary!' : ''
        } ${sidebarCollapsed && !item.icon ? 'invisible opacity-0' : ''}`
      }
    >
      {item.icon && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {item.iconType === 'svg' && (
            <SvgIcon name={item.icon as SvgIconName} className="h-5 w-5" />
          )}
          {item.iconType === 'image' && (
            <img src={item.icon} className="h-5 w-5 rounded" alt={t(item.labelKey)} />
          )}
        </span>
      )}

      <span
        className={`flex-1 origin-left overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-all duration-300 ${
          sidebarCollapsed ? 'invisible opacity-0' : ''
        }`}
      >
        {t(item.labelKey)}
      </span>
    </NavLink>
  );
}
