import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MdMenu, MdLock, MdLogout } from 'react-icons/md';
import { useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/constants/routes';
import { USER_MENU_ACTIONS } from '@/lib/constants/layout';
import type { UserMenuAction } from '@/types/layout';

interface UserMenuProps {
  collapsed: boolean;
}

const ACTION_ICONS: Record<UserMenuAction['action'], typeof MdLock> = {
  password: MdLock,
  logout: MdLogout,
};

export function UserMenu({ collapsed }: UserMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userName, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = (action: UserMenuAction) => {
    setIsOpen(false);

    if (action.action === 'password') {
      navigate(ROUTES.AUTH.PW_RESET);
      return;
    }

    if (action.action === 'logout') {
      const confirmed = window.confirm(
        `${t('USER_MENU.LOGOUT_CONFIRM_TITLE')}\n${t('USER_MENU.LOGOUT_CONFIRM_MESSAGE')}`
      );
      if (confirmed) {
        void logout();
      }
    }
  };

  return (
    <div className="relative w-full">
      {isOpen && (
        <button
          type="button"
          aria-label="close-user-menu"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setIsOpen(false)}
        />
      )}

      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 min-w-70 rounded-md bg-surface-white p-1 shadow-lg">
          {USER_MENU_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action.action];
            return (
              <div key={action.action}>
                {action.separator && <div className="my-1 h-px w-full bg-border-light" />}
                <button
                  type="button"
                  onClick={() => handleAction(action)}
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-colors hover:bg-gray-100 ${
                    action.danger ? 'text-status-error hover:bg-bg-error' : 'text-text-default'
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span>{t(action.labelKey)}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-label="user-menu"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-all duration-300 hover:bg-bg-brand-weak"
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <img src="/icons/default-avt-icon.svg" alt="" className="size-6 shrink-0 rounded-full" />
          <span
            className={`truncate text-xs font-medium transition-all duration-300 ${
              collapsed ? 'invisible w-0 opacity-0' : 'opacity-100'
            }`}
          >
            {userName}
          </span>
        </span>
        <MdMenu
          className={`size-5 shrink-0 text-text-weak transition-all duration-300 ${
            collapsed ? 'invisible opacity-0' : 'opacity-100'
          }`}
        />
      </button>
    </div>
  );
}
