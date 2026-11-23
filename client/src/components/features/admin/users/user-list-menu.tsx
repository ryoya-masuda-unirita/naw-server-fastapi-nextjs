import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';

interface UserListMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

/** 移植元 user-list-menu.component。行の右端の「編集・削除」メニュー */
export function UserListMenu({ onEdit, onDelete }: UserListMenuProps) {
  const { t } = useTranslation();

  return (
    <div className="block">
      <ContextMenu
        triggerTestid="admin-users-row-menu-button"
        menu={({ close }) => (
          <>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                data-testid="admin-users-edit-button"
                className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-secondary transition-colors w-full text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                  close();
                }}
              >
                <AppMatIcon icon="border_color" className="text-text-strong shrink-0 text-[20px]! leading-none!" />
                <span className="text-label text-text-strong truncate">
                  {t('ADMIN.USER_MANAGEMENT.EDIT_USER_SETTINGS')}
                </span>
              </button>
            </div>

            <hr className="border-border-weak" />

            <div className="flex flex-col gap-1">
              <button
                type="button"
                data-testid="admin-users-delete-button"
                className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-error transition-colors w-full text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                  close();
                }}
              >
                <AppMatIcon icon="delete" className="text-status-error shrink-0 text-[20px]! leading-none!" />
                <span className="text-label text-status-error truncate">{t('COMMON.DELETE')}</span>
              </button>
            </div>
          </>
        )}
      />
    </div>
  );
}
