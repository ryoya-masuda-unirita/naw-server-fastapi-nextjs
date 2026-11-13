import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { UserAddDialog } from '@/components/features/admin/users/user-add-dialog';
import { UserEditDialog } from '@/components/features/admin/users/user-edit-dialog';
import { LoginKeyStatusIcon } from '@/components/features/admin/users/login-key-status-icon';
import { UserListMenu } from '@/components/features/admin/users/user-list-menu';
import { UserPasswordRevealDialog } from '@/components/features/admin/users/user-password-reveal-dialog';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption } from '@/components/shared/types';
import { useAdminUsers, useDeleteAdminUsers } from '@/hooks/use-admin-users';
import { useUserListStore } from '@/store/user-list-store';
import type {
  AdminUser,
  UserApiItem,
  UserCreateApiResponse,
  UserRoleUi,
  UserSortField,
  UserSortOrder,
  UserUpdateApiResponse,
} from '@/types/admin/user.types';

const SORT_OPTIONS: SortOption[] = [
  { label: 'ADMIN.USER_MANAGEMENT.SORT_UPDATED_AT', value: 'updatedAt' },
  { label: 'ADMIN.USER_MANAGEMENT.SORT_USER_NAME', value: 'name' },
  { label: 'ADMIN.USER_MANAGEMENT.SORT_ROLE', value: 'role' },
  { label: 'ADMIN.USER_MANAGEMENT.SORT_USED_CREDITS', value: 'totalCredits' },
];

const REVEAL_DIALOG_WIDTH = '560px';

/** 初期パスワード・ログインキーを 1 回だけ見せるためのデータ。閉じたら捨てる（平文を状態に残さない） */
interface RevealData {
  initialPassword: string | null;
  passwordExpiredAt: string | null;
  loginKey: string | null;
}

function toAdminUser(item: UserApiItem): AdminUser {
  return {
    id: item.id,
    userId: item.userId,
    displayName: item.displayName,
    role: item.role,
    totalCredits: item.totalCredits ?? 0,
    hasLoginKey: item.hasLoginKey === true,
    accountType: item.accountType,
    email: item.email,
    updatedAt: item.updatedAt,
  };
}

function getRevealTitleKey({ loginKey, initialPassword }: RevealData): string {
  if (!loginKey) return 'ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_TITLE';
  return initialPassword
    ? 'ADMIN.USER_MANAGEMENT.ISSUED_CREDENTIALS_TITLE'
    : 'ADMIN.USER_MANAGEMENT.LOGIN_KEY_REVEAL_TITLE';
}

/** 移植元 AdminUserListComponent（`/admin/users`） */
export function AdminUserListPage() {
  const { t } = useTranslation();
  const toast = useToastStore();
  const {
    filter,
    selectedIds,
    updateFilter,
    updatePageIndex,
    resetFilter,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
  } = useUserListStore();
  const { data, isFetching } = useAdminUsers(filter);
  const deleteUsers = useDeleteAdminUsers();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deletingLoginIds, setDeletingLoginIds] = useState<string[] | null>(null);
  const [reveal, setReveal] = useState<RevealData | null>(null);

  // 読み込みに失敗したときは一覧を空にする（移植元の store と同じ）
  const items = useMemo(() => (data?.data ?? []).map(toAdminUser), [data]);
  const totalItems = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));

  // 読み込んだページにないユーザーの選択は無いものとして扱う（移植元は読み込みのたびに選択を絞り込む）
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const someSelected = selectedItems.length > 0;
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const pageFrom = (filter.pageIndex - 1) * filter.pageSize + 1;
  const pageTo = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay = totalItems > 0 ? `${pageFrom}-${pageTo} / ${totalItems}` : '';

  const roleFilterOptions: SelectOption[] = [
    { value: '', label: t('ADMIN.USER_MANAGEMENT.ALL_ROLES') },
    { value: 'admin', label: t('ADMIN.USER_MANAGEMENT.ROLE_ADMIN') },
    { value: 'user', label: t('ADMIN.USER_MANAGEMENT.ROLE_GENERAL') },
  ];

  const handleRoleFilterChange = (role: string) => {
    const nextRole = role === 'admin' || role === 'user' ? (role as UserRoleUi) : undefined;
    updateFilter({ role: nextRole });
  };

  const handleSortChange = (field: string | null, order: string | null) => {
    updateFilter({
      sortField: (field ?? undefined) as UserSortField | undefined,
      sortOrder: (order ?? undefined) as UserSortOrder | undefined,
    });
  };

  const getRoleDisplay = (role: string): string => {
    if (role.toLowerCase() === 'admin') return t('ADMIN.USER_MANAGEMENT.ROLE_ADMIN');
    // API の SYSTEM も一覧では「一般」と同じ表記にする（システム専用ラベルは出さない）
    return t('ADMIN.USER_MANAGEMENT.ROLE_GENERAL');
  };

  const handleDeleteRequest = (user?: AdminUser) => {
    const loginIds = user ? [user.userId] : selectedItems.map((item) => item.userId);
    if (loginIds.length === 0) return;
    setDeletingLoginIds(loginIds);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingLoginIds) return;
    try {
      await deleteUsers.mutateAsync(deletingLoginIds);
      toast.success(t('ADMIN.USER_MANAGEMENT.DELETE_SUCCESS'));
      setDeletingLoginIds(null);
    } catch {
      toast.error(t('ADMIN.USER_MANAGEMENT.DELETE_FAILED'));
    }
  };

  const handleCreated = (response: UserCreateApiResponse) => {
    resetFilter();
    setAdding(false);
    setReveal({
      initialPassword: response.initialPassword,
      passwordExpiredAt: response.passwordExpiredAt,
      loginKey: response.loginKey,
    });
  };

  const handleUpdated = (response: UserUpdateApiResponse) => {
    setEditing(null);
    if ((response.initialPassword && response.passwordExpiredAt) || response.loginKey) {
      setReveal({
        initialPassword: response.initialPassword,
        passwordExpiredAt: response.passwordExpiredAt,
        loginKey: response.loginKey,
      });
    }
  };

  return (
    <>
      <AdminPageShell header={<PageHeader title="" titleKey="ADMIN_CONSOLE.USER_MANAGEMENT" />}>
        <div className="flex flex-col h-full">
          {/* モバイルでは下に固定、PC ではその場に出す操作バー */}
          <div className="sp-fixed-btn">
            {someSelected ? (
              <div className="flex flex-col-reverse md:flex-row gap-3">
                <Button variant="outline" intent="cancel" size="lg" onClick={clearSelection}>
                  {t('ADMIN.ASSISTANT.CLEAR_SELECTION')}
                </Button>
                <Button variant="outline" intent="delete" size="lg" onClick={() => handleDeleteRequest()}>
                  <SvgIcon name="delete" className="w-5 h-5" />
                  {t('COMMON.DELETE')}
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  variant="solid"
                  size="lg"
                  fullWidth
                  className="w-full md:w-auto"
                  dataTestid="admin-users-create-button"
                  onClick={() => setAdding(true)}
                >
                  <SvgIcon name="addCircle" className="w-5 h-5" />
                  {t('ADMIN.USER_MANAGEMENT.CREATE_NEW_USER')}
                </Button>
              </div>
            )}
          </div>

          <div className="library-filters">
            <div className="flex flex-col gap-1 w-full md:w-40">
              <label htmlFor="user-search" className="font-medium text-xs leading-[1.4] text-text-muted">
                {t('ADMIN.USER_MANAGEMENT.SEARCH')}
              </label>
              <SearchInput
                size="small"
                placeholder="ADMIN.USER_MANAGEMENT.SEARCH_PLACEHOLDER"
                value={filter.query ?? ''}
                dataTestid="user-search"
                onValueChange={(query) => updateFilter({ query })}
              />
            </div>
            <div className="flex flex-col gap-1 w-full md:w-40">
              <label className="font-medium text-xs leading-[1.4] text-text-muted">
                {t('ADMIN.USER_MANAGEMENT.FILTER')}
              </label>
              <Select
                options={roleFilterOptions}
                value={filter.role ?? ''}
                placeholder={t('ADMIN.USER_MANAGEMENT.ALL_ROLES')}
                className="w-full md:w-40"
                size="small"
                onValueChange={(value) => handleRoleFilterChange(value || '')}
              />
            </div>
            <div className="flex flex-col gap-1 w-full md:w-40">
              <label className="font-medium text-xs leading-[1.4] text-text-muted">
                {t('ADMIN.USER_MANAGEMENT.SORT')}
              </label>
              <FormSortInput
                size="sm"
                selectedField={filter.sortField ?? null}
                selectedOrder={filter.sortOrder ?? 'desc'}
                placeholder="ADMIN.USER_MANAGEMENT.SORT_UPDATED_AT"
                className="w-full"
                fields={SORT_OPTIONS}
                testidPrefix="user-sort"
                onFieldChange={(field) => handleSortChange(field, filter.sortOrder ?? 'desc')}
                onOrderChange={(order) => handleSortChange(filter.sortField ?? null, order)}
              />
            </div>
            <div className="flex justify-center w-full md:w-auto ml-auto">
              <Pagination
                totalPages={totalPages}
                useQueryParams={false}
                showPageSize={false}
                showPageNumbers={false}
                currentPageOverride={filter.pageIndex}
                countDisplay={countDisplay}
                onPageChange={updatePageIndex}
              />
            </div>
          </div>

          {isFetching ? (
            <div className="flex justify-center p-8" data-testid="admin-users-loading">
              <CircularLoading />
            </div>
          ) : (
            <TableList>
              {/* 見出し（PC） */}
              <TableListItem
                isHeader
                showCheckbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                className="hidden md:flex"
                onCheckedChange={(checked) => toggleSelectAll(checked, items.map((item) => item.id))}
                actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
              >
                <span className="table-list-col-content table-list-label">{t('ADMIN_CONSOLE.DISPLAY_NAME')}</span>
                <span className="table-list-col-date table-list-label md:w-82">{t('ADMIN_CONSOLE.USER_ID')}</span>
                <span className="table-list-col-date table-list-label md:w-16">{t('ADMIN_CONSOLE.PERMISSION')}</span>
                <span className="table-list-col-date table-list-label md:w-30">{t('ADMIN_CONSOLE.USED_TOKENS')}</span>
                <span className="table-list-col-date table-list-label md:w-20">{t('ADMIN_CONSOLE.LOGIN_KEY')}</span>
              </TableListItem>

              {/* 見出し（モバイル） */}
              <TableListItem
                isHeader
                showCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                className="flex md:hidden"
                onCheckedChange={(checked) => toggleSelectAll(checked, items.map((item) => item.id))}
              >
                <span className="table-list-label">{t('COMMON.SELECT_ALL')}</span>
              </TableListItem>

              {items.map((item) => (
                <TableListItem
                  key={item.id}
                  showCheckbox
                  checked={selectedIds.has(item.id)}
                  dataTestid="admin-users-list-row"
                  onCheckedChange={(checked) => toggleSelected(item.id, checked)}
                  actions={
                    <div className="relative">
                      <UserListMenu onEdit={() => setEditing(item)} onDelete={() => handleDeleteRequest(item)} />
                    </div>
                  }
                >
                  <div className="table-list-col-content table-list-start-label">
                    <p className="table-list-title text-label-large md:text-label-x-large">{item.displayName}</p>
                  </div>

                  <div className="table-list-row-date md:w-82">
                    <span className="table-list-label md:hidden w-30 md:w-auto">{t('ADMIN_CONSOLE.USER_ID')}</span>
                    <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                      {item.userId}
                    </span>
                  </div>

                  <div className="table-list-row-date md:w-16">
                    <span className="table-list-label md:hidden w-30 md:w-auto">{t('ADMIN_CONSOLE.PERMISSION')}</span>
                    <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                      {getRoleDisplay(item.role)}
                    </span>
                  </div>

                  <div className="table-list-row-date md:w-30">
                    <span className="table-list-label md:hidden w-30 md:w-auto">{t('ADMIN_CONSOLE.USED_TOKENS')}</span>
                    <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                      {item.totalCredits.toLocaleString()}
                    </span>
                  </div>

                  <div className="table-list-row-date md:w-20">
                    <span className="table-list-label md:hidden w-30 md:w-auto">{t('ADMIN_CONSOLE.LOGIN_KEY')}</span>
                    <LoginKeyStatusIcon
                      hasLoginKey={item.hasLoginKey}
                      testid="admin-users-login-key-status"
                      className="table-list-date flex-1 w-20 md:w-auto"
                    />
                  </div>
                </TableListItem>
              ))}

              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-text-muted">{t('ADMIN.USER_MANAGEMENT.NO_DATA')}</div>
              )}
            </TableList>
          )}

          {totalItems > 0 && (
            <div className="flex justify-center">
              <Pagination
                totalPages={totalPages}
                useQueryParams={false}
                showPageSize={false}
                showFirstLast={false}
                currentPageOverride={filter.pageIndex}
                onPageChange={updatePageIndex}
              />
            </div>
          )}
        </div>
      </AdminPageShell>

      {adding && <UserAddDialog onCreated={handleCreated} onClose={() => setAdding(false)} />}

      {editing && <UserEditDialog user={editing} onUpdated={handleUpdated} onClose={() => setEditing(null)} />}

      <Dialog
        open={deletingLoginIds !== null}
        title={t('ADMIN.USER_MANAGEMENT.DELETE_TITLE')}
        message={t('ADMIN.USER_MANAGEMENT.DELETE_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        confirmIcon="delete"
        confirmMinWidth="min-w-30.5"
        showCancel
        showConfirm
        confirmDanger
        buttonAlign="center"
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeletingLoginIds(null)}
      />

      {reveal && (
        <Dialog
          open
          title={t(getRevealTitleKey(reveal))}
          showConfirm={false}
          showCancel
          cancelText={t('ADMIN.USER_MANAGEMENT.INITIAL_PASSWORD_CLOSE')}
          cancelTestid="admin-users-password-reveal-close-button"
          buttonAlign="right"
          dialogWidth={REVEAL_DIALOG_WIDTH}
          disableClose
          onClose={() => setReveal(null)}
        >
          <UserPasswordRevealDialog
            initialPassword={reveal.initialPassword}
            passwordExpiredAt={reveal.passwordExpiredAt}
            loginKey={reveal.loginKey}
          />
        </Dialog>
      )}
    </>
  );
}
