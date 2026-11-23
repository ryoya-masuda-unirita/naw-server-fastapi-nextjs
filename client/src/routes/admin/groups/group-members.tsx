import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/button';
import { Dialog } from '@/components/shared/dialog';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import { Table } from '@/components/shared/table';
import type { SelectOption, TabItem, TableColumn } from '@/components/shared/types';
import { ROUTES } from '@/lib/constants/routes';

/** 移植元のモックのグループ名（遷移元から名前が渡されなかったときに出る） */
const DEFAULT_GROUP_NAME = 'チームA';
const FIRST_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DELETE_DIALOG_WIDTH = '750px';
const DELETE_MESSAGE =
  'メッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入ります';

interface GroupMember {
  id: string;
  name: string;
  role: 'グループ管理者' | '一般';
}

// 移植元のモックデータ
const MEMBERS: GroupMember[] = [
  { id: '1', name: '由宇名前', role: 'グループ管理者' },
  { id: '2', name: '由宇名前', role: '一般' },
  { id: '3', name: '由宇名前', role: 'グループ管理者' },
  { id: '4', name: '由宇名前', role: '一般' },
  { id: '5', name: '由宇名前', role: '一般' },
];

const TABS: TabItem[] = [
  { id: 'users', label: '所属ユーザー' },
  { id: 'assistants', label: '所属アシスタント' },
];

const FILTER_OPTIONS: SelectOption[] = [
  { label: '全ユーザー', value: '全ユーザー' },
  { label: '自分のみ', value: '自分のみ' },
  { label: '他ユーザーのみ', value: '他ユーザーのみ' },
];

/** 遷移元が router state で渡すグループ（移植元 `state['group']`） */
interface GroupRouteState {
  group?: { name?: string };
}

/**
 * 移植元 `GroupMembersComponent`（management/group-list/group-members）。
 * 移植元でも旧ルート（`/admin/groups/:id/members`）の残りで、モックデータを表示するだけの画面。
 * 移植元の挙動のうち、次はテンプレートから呼ばれず到達できないため移していない:
 * - 「所属アシスタント」タブ（移植元はタブの切り替えを受け取っておらず、表は常にユーザー）
 * - ユーザー・アシスタントの追加、選択行の削除、行クリック、メニュー、検索の実行
 * ダイアログの確認ボタンも移植元は表示しない（showConfirm 未指定）ため、キャンセルしかない
 */
export function GroupMembersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as GroupRouteState | null;

  const [groupName] = useState(routeState?.group?.name ?? DEFAULT_GROUP_NAME);
  const [filterType, setFilterType] = useState<string | null>('全ユーザー');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(FIRST_PAGE);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');

  const totalPages = Math.ceil(MEMBERS.length / DEFAULT_PAGE_SIZE);
  const start = (currentPage - 1) * DEFAULT_PAGE_SIZE;
  const paginatedData = MEMBERS.slice(start, start + DEFAULT_PAGE_SIZE);

  const columns: TableColumn<GroupMember>[] = [
    { field: 'name', header: 'ユーザー', sortable: true, width: '30%' },
    {
      field: 'role',
      header: '権限',
      sortable: true,
      width: '70%',
      render: (row) => (
        <div className="flex flex-row md:flex-col justify-between md:justify-start items-center md:items-start">
          <span className="text-xs text-text-muted inline md:hidden">{t('AUTH.PERMISSION')}</span>
          <span className="text-xs md:text-sm text-text-default">{row.role}</span>
        </div>
      ),
    },
  ];

  const openEditGroup = () => {
    setEditGroupName(groupName);
    setIsEditOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={groupName}
        showSidebarToggle
        showActions={false}
        showLanguageToggle
        tabs={TABS}
        showBackButtonInMobile
        onBackClick={() => navigate(ROUTES.APP.ADMIN_GROUPS)}
      />

      <div className="flex flex-col gap-6 pt-4 pb-19 md:py-6 px-4">
        <div className="hidden md:block">
          <Button
            variant="solid"
            size="lg"
            iconPosition="right"
            className="w-42"
            onClick={openEditGroup}
          >
            <span>{t('ADMIN_CONSOLE.ADD_USER')}</span>
            <MatIcon name="add" size={20} className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
          <div className="flex flex-col gap-1 w-full">
            <span className="text-sm font-medium text-text-muted">{t('ADMIN_CONSOLE.FILTER')}</span>
            <div className="flex flex-col md:flex-row flex-wrap gap-3 w-full">
              <Select
                options={FILTER_OPTIONS}
                value={filterType}
                onValueChange={setFilterType}
                className="md:w-60 w-full"
              />
              <SearchInput
                placeholder="ADMIN_CONSOLE.SEARCH_PLACEHOLDER"
                value={searchTerm}
                onValueChange={setSearchTerm}
                className="md:w-60 w-full"
                size="small"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full justify-center md:justify-start md:w-auto">
            <Pagination
              totalPages={totalPages}
              useQueryParams={false}
              currentPageOverride={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        <div>
          <Table data={paginatedData} columns={columns} selectable sortable />
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 h-19 p-4 bg-white border-t border-border shadow-lg">
        <Button variant="solid" size="lg" fullWidth className="w-full!" onClick={openEditGroup}>
          <span>{t('ADMIN_CONSOLE.ADD_USER')}</span>
          <MatIcon name="add" size={24} />
        </Button>
      </div>

      <Dialog
        open={isEditOpen}
        title="チームの編集"
        cancelText="キャンセル"
        showCancel
        buttonAlign="right"
        bottomLeftContent={
          <Button variant="text" size="md" onClick={() => setIsDeleteOpen(true)}>
            <span>{t('COMMON.DELETE')}</span>
          </Button>
        }
        onClose={() => setIsEditOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={editGroupName}
            onChange={(event) => setEditGroupName(event.target.value)}
            placeholder={t('ADMIN_CONSOLE.GROUP_NAME_PLACEHOLDER')}
            className="w-full px-4 py-2.5 border border-border rounded-lg text-sm text-text-default placeholder:text-text-muted focus:outline-none"
          />
        </div>
      </Dialog>

      <Dialog
        open={isDeleteOpen}
        title="削除の確認"
        message={DELETE_MESSAGE}
        cancelText="キャンセル"
        showCancel
        dialogWidth={DELETE_DIALOG_WIDTH}
        panelClass="delete-confirmation-dialog"
        onClose={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
