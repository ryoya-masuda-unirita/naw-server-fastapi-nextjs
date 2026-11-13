import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  GroupUsersFilter,
  ROLE_FILTER_ALL,
  type GroupUsersFilterChange,
} from '@/components/features/admin/groups/group-users-filter';
import { GroupUsersTable } from '@/components/features/admin/groups/group-users-table';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { FormRadio, type FormRadioOption } from '@/components/shared/form-radio';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { MultiSelect } from '@/components/shared/multi-select';
import { Pagination } from '@/components/shared/pagination';
import { useDocumentClick } from '@/components/shared/select-hooks';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption } from '@/components/shared/types';
import {
  fetchAddUserOptions,
  useAddGroupUsers,
  useGroupUsers,
  useRemoveGroupUsers,
  useUpdateGroupUserRole,
} from '@/hooks/use-group-users';
import { matchesCurrentUser } from '@/lib/utils/auth-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useGroupUsersStore } from '@/store/group-users-store';
import type { GroupUserRole } from '@/types/admin/group-management.types';
import type { UserApiItem } from '@/types/admin/user.types';

/** 権限の編集ダイアログの幅（移植元 `maxWidth: '480px'`） */
const EDIT_ROLE_DIALOG_WIDTH = 'min(100%, 480px)';

/** 移植元 GroupDetailUsersComponent（`/admin/groups/:id/users`）。所属ユーザーのタブ */
export function GroupDetailUsersPage() {
  const { t } = useTranslation();
  const toast = useToastStore();
  const groupId = useParams().id ?? '';
  const currentUser = useAuthStore((state) => state.user);
  const { filter, selectedIds, updateFilter, updatePageIndex, toggleSelected, toggleSelectAll } =
    useGroupUsersStore();
  const clearSelection = useGroupUsersStore((state) => state.clearSelection);
  const reset = useGroupUsersStore((state) => state.reset);

  const { data, isFetching } = useGroupUsers(groupId, filter);
  const addUsers = useAddGroupUsers(groupId);
  const removeUsers = useRemoveGroupUsers(groupId);
  const updateRole = useUpdateGroupUserRole(groupId);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [addOptions, setAddOptions] = useState<SelectOption[] | null>(null);
  const [addSelection, setAddSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<UserApiItem | null>(null);
  const [editRoleValue, setEditRoleValue] = useState<GroupUserRole>('user');
  const [removingIds, setRemovingIds] = useState<string[] | null>(null);

  // 画面を離れる・別のグループへ移ったら条件と選択を捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => reset, [groupId, reset]);

  // 移植元の `@HostListener('document:click')`
  useDocumentClick(() => setOpenMenuId(null));

  // 読み込みに失敗したときは一覧を空にする（移植元の store と同じ）
  const items = data?.content ?? [];
  const totalItems = data?.totalElements ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay =
    totalItems === 0 ? '' : t('GROUPS.PAGE_COUNT', { from, to, total: totalItems });

  // 読み込んだページにないユーザーの選択は無いものとして扱う（移植元は読み込みのたびに選択を絞り込む）
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const someSelected = selectedItems.length > 0;
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const isCurrentUser = (user: UserApiItem) => matchesCurrentUser(user, currentUser);

  const isCurrentUserId = (userId: string): boolean => {
    const member = items.find((item) => item.id === userId);
    if (member) return isCurrentUser(member);
    if (!currentUser) return false;
    return userId === currentUser.id || userId === currentUser.name;
  };

  const handleFilterChange = (event: GroupUsersFilterChange) => {
    updateFilter({
      query: event.query || undefined,
      role: event.role === ROLE_FILTER_ALL ? undefined : event.role === 'admin' ? 'ADMIN' : 'USER',
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  };

  const handleToggleMenu = (id: string) => {
    if (isCurrentUserId(id)) return;
    setOpenMenuId((current) => (current === id ? null : id));
  };

  // --- ユーザーの追加 ---
  const handleAddUser = async () => {
    setAddSelection([]);
    setAddOptions(await fetchAddUserOptions(groupId));
  };

  const handleAddSubmit = async () => {
    if (addUsers.isPending || addSelection.length === 0) return;
    try {
      await addUsers.mutateAsync(addSelection);
      toast.success(t('GROUPS.ADD_USER_SUCCESS'));
      setAddOptions(null);
    } catch {
      toast.error(t('GROUPS.ADD_USER_FAILED'));
    }
  };

  // --- 権限の編集 ---
  const handleEditRole = (user: UserApiItem) => {
    if (isCurrentUser(user)) return;
    setEditRoleValue(user.groupAdmin ? 'admin' : 'user');
    setEditing(user);
  };

  const handleEditRoleSubmit = async () => {
    if (!editing || updateRole.isPending) return;
    if (isCurrentUserId(editing.id) && editRoleValue === 'user') {
      toast.error(t('GROUPS.CANNOT_DEMOTE_SELF'));
      return;
    }
    try {
      await updateRole.mutateAsync({ userId: editing.id, role: editRoleValue });
      toast.success(t('GROUPS.EDIT_ROLE_SUCCESS'));
      setEditing(null);
    } catch {
      toast.error(t('GROUPS.EDIT_ROLE_FAILED'));
    }
  };

  // 自分自身を編集するときは「管理者」しか選べない（降格できないため。移植元 `roleOptions`）
  const isEditingSelf = editing !== null && isCurrentUserId(editing.id);
  const allRoleOptions: FormRadioOption<GroupUserRole>[] = [
    { value: 'user', label: t('GROUPS.ROLE_MEMBER') },
    { value: 'admin', label: t('GROUPS.ROLE_ADMIN') },
  ];
  const roleOptions = allRoleOptions.filter((option) => !isEditingSelf || option.value === 'admin');

  // --- ユーザーの削除 ---
  const handleRemoveUser = (user?: UserApiItem) => {
    if (user && isCurrentUser(user)) return;
    const ids = (user ? [user.id] : Array.from(selectedIds)).filter((id) => !isCurrentUserId(id));
    if (ids.length === 0) return;
    setRemovingIds(ids);
  };

  const handleRemoveSubmit = async () => {
    if (!removingIds || removeUsers.isPending) return;
    try {
      await removeUsers.mutateAsync(removingIds);
      clearSelection();
      toast.success(t('GROUPS.REMOVE_USER_SUCCESS'));
      setRemovingIds(null);
    } catch {
      toast.error(t('GROUPS.REMOVE_USER_FAILED'));
    }
  };

  return (
    <>
      <div className="flex flex-col grow min-h-0 gap-8 md:gap-6 py-4 md:py-6">
        {/* 操作バー（モバイルでは下に固定） */}
        <div className="sp-fixed-btn">
          {someSelected ? (
            <div className="flex flex-col-reverse md:flex-row gap-3">
              <Button variant="outline" intent="cancel" size="lg" type="button" onClick={clearSelection}>
                {t('GROUPS.DESELECT')}
              </Button>
              <Button
                variant="outline"
                intent="delete"
                size="lg"
                type="button"
                onClick={() => handleRemoveUser()}
              >
                <SvgIcon name="delete" className="w-5 h-5" />
                {t('GROUPS.REMOVE_SELECTED')}
              </Button>
            </div>
          ) : (
            <div>
              <Button
                variant="solid"
                size="lg"
                type="button"
                fullWidth
                className="w-full md:w-auto"
                dataTestid="admin-groups-add-user-button"
                onClick={() => void handleAddUser()}
              >
                <SvgIcon name="addCircle" className="w-5 h-5" />
                {t('GROUPS.ADD_USER')}
              </Button>
            </div>
          )}
        </div>

        <GroupUsersFilter
          pageIndex={filter.pageIndex}
          totalPages={totalPages}
          countDisplay={countDisplay}
          onPageIndexChange={updatePageIndex}
          onFilterChange={handleFilterChange}
        />

        {isFetching ? (
          <div className="flex justify-center p-8">
            <CircularLoading />
          </div>
        ) : (
          <>
            <GroupUsersTable
              items={items}
              selectedIds={selectedIds}
              allSelected={allSelected}
              someSelected={someSelected}
              openMenuId={openMenuId}
              currentUser={currentUser}
              onSelectAllChange={(checked) =>
                toggleSelectAll(
                  checked,
                  items.map((item) => item.id),
                )
              }
              onItemSelectChange={toggleSelected}
              onToggleMenu={handleToggleMenu}
              onEditRole={handleEditRole}
              onRemoveUser={handleRemoveUser}
            />

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
          </>
        )}
      </div>

      {addOptions && (
        <Dialog
          open
          title={t('GROUPS.ADD_USER')}
          confirmText={t('GROUPS.ADD_USER_SUBMIT')}
          cancelText={t('COMMON.CANCEL')}
          showCancel
          showConfirm
          buttonAlign="right"
          confirmDisabled={addSelection.length === 0}
          dialogWidth="100%"
          panelClass="term-main-dialog"
          onConfirm={() => void handleAddSubmit()}
          onClose={() => setAddOptions(null)}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-default leading-[1.4]">
              {t('GROUPS.MEMBERS_LABEL')}
            </span>
            <p className="text-xs text-text-muted leading-[1.4] mb-2">
              {t('GROUPS.ADD_USER_SUPPORT')}
            </p>
            <MultiSelect
              value={addSelection}
              options={addOptions}
              placeholder={t('GROUPS.MEMBERS_PLACEHOLDER')}
              onSelectionChange={setAddSelection}
            />
          </div>
        </Dialog>
      )}

      {editing && (
        <Dialog
          open
          title={t('GROUPS.EDIT_ROLE_ACTION')}
          confirmText={t('COMMON.SAVE')}
          cancelText={t('COMMON.CANCEL')}
          showCancel
          showConfirm
          buttonAlign="right"
          dialogWidth={EDIT_ROLE_DIALOG_WIDTH}
          onConfirm={() => void handleEditRoleSubmit()}
          onClose={() => setEditing(null)}
        >
          <div className="flex flex-col">
            <FormRadio
              label={t('GROUPS.ADMINS_LABEL')}
              supportText={t('GROUPS.ADMINS_SUPPORT')}
              value={editRoleValue}
              options={roleOptions}
              layout="vertical"
              classOption="flex-col gap-3"
              onValueChange={setEditRoleValue}
            />
          </div>
        </Dialog>
      )}

      <Dialog
        open={removingIds !== null}
        title={t('GROUPS.REMOVE_USER_TITLE')}
        message={t('GROUPS.REMOVE_USER_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        confirmIcon="delete"
        showCancel
        showConfirm
        confirmDanger
        buttonAlign="center"
        onConfirm={() => void handleRemoveSubmit()}
        onClose={() => setRemovingIds(null)}
      />
    </>
  );
}
