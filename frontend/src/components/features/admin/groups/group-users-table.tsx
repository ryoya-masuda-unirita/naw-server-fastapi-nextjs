import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { User } from '@/types/auth';
import type { UserApiItem } from '@/types/admin/user.types';
import { matchesCurrentUser } from '@/lib/utils/auth-helpers';
import { formatCredits } from './group-format';

interface GroupUsersTableProps {
  items: UserApiItem[];
  selectedIds: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  /** 行のメニューが開いているユーザーの ID */
  openMenuId: string | null;
  currentUser: User | null;
  onSelectAllChange: (checked: boolean) => void;
  onItemSelectChange: (id: string, checked: boolean) => void;
  onToggleMenu: (id: string) => void;
  onEditRole: (user: UserApiItem) => void;
  onRemoveUser: (user: UserApiItem) => void;
}

/** 移植元 `<app-group-users-table>`。所属ユーザーの一覧表 */
export function GroupUsersTable({
  items,
  selectedIds,
  allSelected,
  someSelected,
  openMenuId,
  currentUser,
  onSelectAllChange,
  onItemSelectChange,
  onToggleMenu,
  onEditRole,
  onRemoveUser,
}: GroupUsersTableProps) {
  const { t } = useTranslation();

  return (
    <TableList>
      {/* 見出し（PC のみ） */}
      <TableListItem
        isHeader
        showCheckbox
        checked={allSelected}
        indeterminate={!allSelected && someSelected}
        className="hidden md:flex"
        onCheckedChange={onSelectAllChange}
        actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
      >
        <span className="table-list-col-content table-list-label">{t('GROUPS.USER_DISPLAY_NAME')}</span>
        <span className="table-list-col-date table-list-label md:w-80.5">{t('GROUPS.PERMISSION')}</span>
        <span className="table-list-col-date table-list-label md:w-80.5">{t('GROUPS.USED_CREDITS')}</span>
      </TableListItem>

      {items.map((item) => {
        const isCurrentUser = matchesCurrentUser(item, currentUser);
        return (
          <TableListItem
            key={item.id}
            showCheckbox
            checked={selectedIds.has(item.id)}
            dataTestid="admin-groups-user-row"
            onCheckedChange={(checked) => onItemSelectChange(item.id, checked)}
            actions={
              <div className="relative">
                <IconButton
                  variant="tertiary-gray"
                  size="largePc"
                  disabled={isCurrentUser}
                  ariaLabel={t('GROUPS.SETTINGS')}
                  dataTestid="admin-groups-user-row-menu-button"
                  onClick={(event) => {
                    onToggleMenu(item.id);
                    event.stopPropagation();
                  }}
                >
                  <SvgIcon name="settings" className="w-5 h-5" />
                </IconButton>
                {openMenuId === item.id && !isCurrentUser && (
                  <div
                    className="flex flex-col absolute right-0 top-full mt-1 p-4 gap-1 z-40 min-w-72 bg-white rounded-lg shadow-default border border-border-strong overflow-hidden animate-fade-in"
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="dl-option w-full"
                      role="menuitem"
                      data-testid="admin-groups-edit-role-button"
                      onClick={() => {
                        onEditRole(item);
                        onToggleMenu(item.id);
                      }}
                    >
                      <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center">
                        <SvgIcon name="edit" className="w-5 h-5" />
                      </span>
                      <span className="min-w-0 truncate">{t('GROUPS.EDIT_ROLE_ACTION')}</span>
                    </button>
                    <hr className="my-1 border-border-weak" />
                    <button
                      type="button"
                      className="dropdown-item dropdown-item--danger w-full px-4"
                      role="menuitem"
                      data-testid="admin-groups-remove-user-button"
                      onClick={() => {
                        onRemoveUser(item);
                        onToggleMenu(item.id);
                      }}
                    >
                      <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center">
                        <SvgIcon name="delete" className="w-5 h-5" />
                      </span>
                      <span className="min-w-0 truncate">{t('GROUPS.REMOVE_USER_ACTION')}</span>
                    </button>
                  </div>
                )}
              </div>
            }
          >
            <div className="table-list-col-content table-list-start-label">
              <p className="table-list-title text-label-large md:text-label-x-large">
                {item.displayName}
              </p>
            </div>
            <div className="table-list-row-date md:w-80.5">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('GROUPS.PERMISSION')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                {t(item.groupAdmin ? 'GROUPS.ROLE_ADMIN' : 'GROUPS.ROLE_MEMBER')}
              </span>
            </div>
            <div className="table-list-row-date md:w-80.5">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('GROUPS.USED_CREDITS')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                {formatCredits(item.totalCredits)}
              </span>
            </div>
          </TableListItem>
        );
      })}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('GROUPS.NO_USERS')}</div>
      )}
    </TableList>
  );
}
