import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UserFormModal,
  type UserFormSavePayload,
} from '@/components/features/users/user-form-modal';
import { USER_ROLES, type LegacyUser } from '@/lib/constants/mock-data';
import { useLegacyUserStore } from '@/store/legacy-user-store';

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;
const FIRST_PAGE = 1;
/** これ以下のページ数なら全ページ番号を並べる。超えると前後だけにして "..." で省く */
const MAX_PAGES_WITHOUT_ELLIPSIS = 7;
const ELLIPSIS = '...';

const TH_CLASS = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
const TD_CLASS = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900';
const NAV_BUTTON_CLASS =
  'px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const GOOGLE_ICON_PATH =
  'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z';
const MICROSOFT_ICON_PATH =
  'M0 0v11.408h11.408V0zm12.594 0v11.408H24V0zM0 12.594V24h11.408V12.594zm12.594 0V24H24V12.594z';

function getRoleLabel(role: string): string {
  return USER_ROLES.find((r) => r.value === role)?.label ?? role;
}

function buildVisiblePages(total: number, current: number): (number | string)[] {
  const pages: (number | string)[] = [];
  if (total <= MAX_PAGES_WITHOUT_ELLIPSIS) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current > 3) pages.push(ELLIPSIS);
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push(ELLIPSIS);
  pages.push(total);
  return pages;
}

function AccountIcon({ accountType }: { accountType: LegacyUser['accountType'] }) {
  if (accountType === 'google') {
    return (
      <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24">
        <path fill="currentColor" d={GOOGLE_ICON_PATH} />
      </svg>
    );
  }
  if (accountType === 'microsoft') {
    return (
      <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24">
        <path fill="currentColor" d={MICROSOFT_ICON_PATH} />
      </svg>
    );
  }
  return <span className="text-gray-400">-</span>;
}

/** 移植元 `UsersComponent`（features/users/users.component.ts）。旧ユーザー管理。モックデータをメモリ上で編集する */
export function UsersPage() {
  const { t } = useTranslation();
  const { users, createUser, updateUser, deleteUser } = useLegacyUserStore();
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(FIRST_PAGE);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<LegacyUser | null>(null);

  const totalUsers = users.length;
  const totalPages = Math.ceil(totalUsers / pageSize);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, currentPage, pageSize]);
  const visiblePages = buildVisiblePages(totalPages, currentPage);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const openEditModal = (user: LegacyUser) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleSave = (payload: UserFormSavePayload) => {
    // 移植元は userId を username に写さないため、保存後に一覧のユーザーIDが空になる。入力した値が出るよう username に写す
    if (editingUser) {
      updateUser(editingUser.id, {
        displayName: payload.displayName,
        username: payload.userId,
        role: payload.role,
      });
    } else {
      createUser({
        displayName: payload.displayName,
        username: payload.userId,
        role: payload.role,
        loginKey: '',
        accountType: null,
        status: 'active',
      });
    }
    closeModal();
  };

  const handleDelete = (userId: string) => {
    if (window.confirm(t('USERS.DELETE_USER_CONFIRM'))) {
      deleteUser(userId);
      closeModal();
    }
  };

  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalUsers);

  return (
    <>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('USERS.TITLE')}</h1>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 w-[168px] h-11 py-2 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              {t('USERS.ADD_USER')}
            </button>

            <button
              type="button"
              className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
            >
              {t('USERS.IMPORT_USERS')}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{t('USERS.ITEMS_PER_PAGE')}</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={TH_CLASS}>{t('USERS.DISPLAY_NAME')}</th>
                  <th className={TH_CLASS}>{t('USERS.USER_ID')}</th>
                  <th className={TH_CLASS}>{t('USERS.PERMISSION')}</th>
                  <th className={TH_CLASS}>{t('USERS.USED_TOKENS')}</th>
                  <th className={TH_CLASS}>{t('USERS.LOGIN_KEY')}</th>
                  <th className={TH_CLASS}>{t('USERS.ACCOUNT')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('USERS.ACTIONS')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.displayName}
                    </td>
                    <td className={TD_CLASS}>{user.username}</td>
                    <td className={TD_CLASS}>{getRoleLabel(user.role)}</td>
                    <td className={TD_CLASS}>{user.loginKey || '-'}</td>
                    <td className={TD_CLASS}>
                      <span className="font-mono">•••••</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <AccountIcon accountType={user.accountType} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                        title="編集"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {t('USERS.NO_USERS_FOUND')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-700">
              {rangeStart} - {rangeEnd} / {totalUsers} {t('USERS.ITEMS')}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className={NAV_BUTTON_CLASS}
              >
                ≪
              </button>
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={NAV_BUTTON_CLASS}
              >
                ‹
              </button>

              {visiblePages.map((page, index) =>
                page === ELLIPSIS ? (
                  // 省略記号は 2 つ出ることがあるので位置も key に含める
                  <span key={`${ELLIPSIS}-${index}`} className="px-3 py-1">
                    {ELLIPSIS}
                  </span>
                ) : (
                  <button
                    type="button"
                    key={page}
                    onClick={() => goToPage(Number(page))}
                    className={`px-3 py-1 rounded hover:bg-gray-200 transition-colors ${
                      currentPage === Number(page) ? 'bg-blue-600 text-white' : ''
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={NAV_BUTTON_CLASS}
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className={NAV_BUTTON_CLASS}
              >
                ≫
              </button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <UserFormModal
          user={editingUser}
          onSave={handleSave}
          onCancel={closeModal}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
