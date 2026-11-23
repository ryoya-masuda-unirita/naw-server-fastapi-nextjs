import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import type { UserMenuAction } from '@/types/layout';

interface UserMenuProps {
  actions: UserMenuAction[];
  userName: string;
  sidebarCollapsed: boolean;
  /** 管理画面への切り替え（switch-role）を出すか（移植元 canShowSwitchRole） */
  canShowSwitchRole: boolean;
  onAction: (action: UserMenuAction) => void;
  avatarUrl?: string;
}

/**
 * 移植元 shared/layouts/sidebar/components/user-menu。
 * メニューの枠は移植元 app-context-menu のパネル（bg-bg-primary ... shadow-default）と同じクラスにしている。
 * context-menu 部品（#278）ができたら、モバイルのボトムドロワー表示も含めてそちらに置き換える。
 */
export function UserMenu({
  actions,
  userName,
  sidebarCollapsed,
  canShowSwitchRole,
  onAction,
  avatarUrl = '/icons/default-avt-icon.svg',
}: UserMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // メニューの外をクリックしたら閉じる（移植元は cdk overlay の透明な backdrop）。
  // サイドバー（aside）は transform を持ち fixed の基準になるため、全画面を覆う backdrop は置けず document で拾う
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const handleAction = (action: UserMenuAction) => {
    setIsOpen(false);
    onAction(action);
  };

  return (
    <div ref={containerRef} className="relative">
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 flex min-w-70 flex-col gap-1 rounded-lg bg-bg-primary p-4 text-xs font-medium shadow-default">
          {actions.map((action) => (
            <div
              key={action.action}
              className={action.action === 'switch-role' && !canShowSwitchRole ? 'hidden' : ''}
            >
              {action.separator && <div className="my-1 h-px w-full bg-border-light" />}
              <button
                type="button"
                data-testid={`user-menu-${action.action}-button`}
                onClick={() => handleAction(action)}
                className={`h-9! w-full rounded-md px-2 text-left text-xs font-normal! transition-colors hover:bg-gray-100 ${
                  action.action === 'logout' ? 'hover:bg-red-50' : ''
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-2 ${action.textClass || 'text-text-default!'}`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <MatIcon name={action.icon} className={action.iconClass || ''} />
                    <span>{t(action.labelKey)}</span>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label="user-menu"
        data-testid="user-menu-button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-56 justify-between rounded-lg py-1.5 transition-all duration-300 hover:bg-bg-brand-weak! md:w-60 ${
          sidebarCollapsed ? 'w-9 px-1.5' : 'px-2'
        }`}
      >
        <div className="flex items-center gap-2">
          <img src={avatarUrl} alt="User Avatar" className="h-6 w-6 rounded-full object-cover" />
          <div
            className={`min-w-0 flex-1 transition-all duration-300 ${
              sidebarCollapsed ? 'invisible opacity-0' : ''
            }`}
          >
            <span className="block origin-left overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium transition-all duration-300">
              {userName}
            </span>
          </div>
        </div>
        <span
          className={`flex h-7! w-7! items-center justify-center text-text-lighter transition-all duration-300 ${
            sidebarCollapsed ? 'invisible opacity-0' : ''
          }`}
        >
          <MatIcon name="menu" />
        </span>
      </button>
    </div>
  );
}
