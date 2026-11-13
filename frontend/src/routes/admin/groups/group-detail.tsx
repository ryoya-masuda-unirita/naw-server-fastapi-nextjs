import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { GroupDetailMenu } from '@/components/features/admin/groups/group-detail-menu';
import { GroupEditDialog } from '@/components/features/admin/groups/group-edit-dialog';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { Dialog } from '@/components/shared/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { useToastStore } from '@/components/shared/toast-store';
import type { TabItem } from '@/components/shared/types';
import { useDeleteGroup, useGroupDetail } from '@/hooks/use-group-detail';
import { GROUP_DETAIL_TABS, ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';

type GroupDetailTabId = (typeof GROUP_DETAIL_TABS)[keyof typeof GROUP_DETAIL_TABS];

/** URL の最後の区間から選択中のタブを決める。タブ名でなければ所属ユーザー（移植元 `detectActiveTabFromUrl`） */
function detectActiveTab(pathname: string): GroupDetailTabId {
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  if (last === GROUP_DETAIL_TABS.TEMPLATES) return GROUP_DETAIL_TABS.TEMPLATES;
  if (last === GROUP_DETAIL_TABS.ASSISTANTS) return GROUP_DETAIL_TABS.ASSISTANTS;
  return GROUP_DETAIL_TABS.USERS;
}

/** 移植元 GroupDetailComponent（`/admin/groups/:id`）。タブ（所属ユーザー・アシスタント・テンプレート）の外枠 */
export function GroupDetailPage() {
  const { t } = useTranslation();
  const toast = useToastStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groupId = useParams().id ?? '';
  const canDelete = !useAuthStore((state) => state.isGroupAdminOnly);

  // 取得に失敗したらグループ名は空のまま（移植元の `groupName.set('')`）
  const groupName = useGroupDetail(groupId).data?.name ?? '';
  const deleteMutation = useDeleteGroup(groupId);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // タブは並び順も移植元どおり（所属ユーザー・所属アシスタント・所属テンプレート）
  const tabs: TabItem[] =
    groupId === ''
      ? []
      : [
          {
            id: GROUP_DETAIL_TABS.USERS,
            label: 'GROUPS.TAB_USERS',
            route: ROUTES.APP.ADMIN_GROUP_DETAIL_TAB(groupId, GROUP_DETAIL_TABS.USERS),
          },
          {
            id: GROUP_DETAIL_TABS.ASSISTANTS,
            label: 'GROUPS.TAB_ASSISTANTS',
            route: ROUTES.APP.ADMIN_GROUP_DETAIL_TAB(groupId, GROUP_DETAIL_TABS.ASSISTANTS),
          },
          {
            id: GROUP_DETAIL_TABS.TEMPLATES,
            label: 'GROUPS.TAB_TEMPLATES',
            route: ROUTES.APP.ADMIN_GROUP_DETAIL_TAB(groupId, GROUP_DETAIL_TABS.TEMPLATES),
          },
        ];

  const handleDeleteConfirm = async () => {
    try {
      await deleteMutation.mutateAsync();
      toast.success(t('GROUPS.DELETE_SUCCESS'));
      setDeleting(false);
      navigate(ROUTES.APP.ADMIN_GROUPS);
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t('GROUPS.DELETE_FAILED'));
    }
  };

  return (
    <>
      <AdminPageShell
        customHeader
        header={
          <PageHeader
            title={groupName}
            showBackButton={false}
            showBackButtonInMobile
            showActions={false}
            showLanguageToggle
            tabs={tabs}
            activeTabId={detectActiveTab(pathname)}
            onBackClick={() => navigate(ROUTES.APP.ADMIN_GROUPS)}
            actions={
              <GroupDetailMenu
                canDelete={canDelete}
                onEdit={() => setEditing(true)}
                onDelete={() => setDeleting(true)}
              />
            }
          />
        }
      >
        <div className="flex flex-col h-full">
          <div className="px-4 md:px-6">
            <Outlet />
          </div>
        </div>
      </AdminPageShell>

      {editing && (
        <GroupEditDialog
          groupId={groupId}
          initialName={groupName}
          onClose={() => setEditing(false)}
        />
      )}

      <Dialog
        open={deleting}
        title={t('GROUPS.DELETE_GROUP')}
        message={t('GROUPS.DELETE_CONFIRM_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        showCancel
        showConfirm
        confirmDanger
        buttonAlign="right"
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}
