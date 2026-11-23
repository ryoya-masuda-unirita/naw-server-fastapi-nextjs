import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { ADMIN_MENU_SECTIONS, GROUP_ADMIN_MENU_SECTIONS } from '@/lib/constants/layout';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';

/** 移植元 layouts/admin-layout/components/admin-sidebar（管理モードのメニュー） */
export function AdminSidebar() {
  const { t } = useTranslation();
  const isGroupAdminOnly = useAuthStore((state) => state.isGroupAdminOnly);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const menuSections = isGroupAdminOnly ? GROUP_ADMIN_MENU_SECTIONS : ADMIN_MENU_SECTIONS;

  return (
    <div className={`py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
      <div className="flex flex-col gap-6">
        {menuSections.map((section) => (
          <div key={section.labelKey} className="flex flex-col">
            {!sidebarCollapsed && (
              <div className="flex h-7 items-center px-2 text-xs font-medium text-text-muted">
                {t(section.labelKey)}
              </div>
            )}

            <div className="flex flex-col">
              {section.items.map((item) => (
                <NavLink
                  key={item.labelKey}
                  to={item.route}
                  title={t(item.labelKey)}
                  className={({ isActive }) =>
                    `flex h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-text-default transition-colors hover:bg-bg-brand-weak ${
                      isActive ? 'bg-bg-brand-strong! text-primary!' : ''
                    }`
                  }
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <MatIcon name={item.icon} />
                  </span>
                  {!sidebarCollapsed && (
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {t(item.labelKey)}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
