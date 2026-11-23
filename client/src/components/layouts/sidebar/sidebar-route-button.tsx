import type { MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { SvgIconName } from '@/components/shared/icons/svg-icon-paths';
import type { MenuItem } from '@/types/layout';

interface SidebarRouteButtonProps {
  item: MenuItem & { route: string };
  sidebarCollapsed: boolean;
  /** ルームの「操作メニュー」ボタンが押されたとき（移植元 roomMenuOpened） */
  onRoomMenuOpen?: (event: MouseEvent<HTMLElement>, roomId: string, isPinned: boolean) => void;
}

/**
 * 移植元 shared/layouts/sidebar/components/sidebar-route-button。
 * ルームの項目（roomId あり）は labelKey にルーム名が入るため、翻訳せずそのまま出す
 * （移植元は翻訳パイプに通すが、ルーム名は i18n キーではなく、`:` や `.` を含む名前が壊れるため）。
 */
export function SidebarRouteButton({
  item,
  sidebarCollapsed,
  onRoomMenuOpen,
}: SidebarRouteButtonProps) {
  const { t } = useTranslation();
  const label = item.roomId ? item.labelKey : t(item.labelKey);

  return (
    <NavLink
      to={item.route}
      title={label}
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
            <img src={item.icon} className="h-5 w-5 rounded" alt={label} />
          )}
        </span>
      )}

      <span
        className={`flex-1 origin-left overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-all duration-300 ${
          sidebarCollapsed ? 'invisible opacity-0' : ''
        }`}
      >
        {label}
      </span>

      {!sidebarCollapsed && (
        <>
          <div className="flex items-center">
            {item.hasPin && (
              <span className="flex h-7 w-7 items-center justify-center text-text-weak">
                <SvgIcon name="push_pin" className="h-5 w-5 text-primary! transition-opacity" />
              </span>
            )}

            {item.hasMenu && (
              <IconButton
                variant="tertiary-gray"
                classProps="dropdown-trigger hidden group-hover:flex group-hover:opacity-100 group-[.group-active]:hover:text-brand-primary! ml-1"
                ariaLabel="操作メニュー"
                onClick={(event) => {
                  if (item.roomId) onRoomMenuOpen?.(event, item.roomId, !!item.hasPin);
                }}
              >
                <SvgIcon name="more" className="h-5 w-5" />
              </IconButton>
            )}
          </div>

          {item.badge && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white transition-all duration-300">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
