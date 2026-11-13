import { useMemo, useState } from 'react';
import { ApiTab } from '@/components/features/admin/tenant/api-tab';
import { TenantRenameDialog } from '@/components/features/admin/tenant/tenant-rename-dialog';
import { UsageTab } from '@/components/features/admin/tenant/usage-tab';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { PageHeader } from '@/components/shared/page-header';
import type { TabItem } from '@/components/shared/types';
import { useTabQueryParam } from '@/hooks/use-tab-query-param';
import { useTenantInfo } from '@/hooks/use-tenant';

const TABS = ['usage', 'api'] as const;

const TAB_ITEMS: TabItem[] = [
  { id: 'usage', label: 'TENANT.TAB_USAGE' },
  { id: 'api', label: 'TENANT.TAB_API' },
];

/** 移植元 TenantComponent（`/admin/tenant`） */
export function TenantPage() {
  const { activeTabId, onTabChange } = useTabQueryParam({ validTabs: TABS, defaultTab: 'usage' });
  const { data, isPending } = useTenantInfo();
  const tenantName = data?.tenantName ?? '';

  const [renaming, setRenaming] = useState(false);
  // 移植元の FormControl は、テナント名が取れる（変わる）たびにその名前で上書きされる
  const [renameValue, setRenameValue] = useState('');
  const [syncedName, setSyncedName] = useState('');
  if (tenantName && tenantName !== syncedName) {
    setSyncedName(tenantName);
    setRenameValue(tenantName);
  }

  const header = useMemo(
    () => (
      <PageHeader
        title={tenantName}
        showActions={false}
        showBackButton={false}
        showTitleEdit
        tabs={TAB_ITEMS}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        onRenameClick={() => setRenaming(true)}
      />
    ),
    [tenantName, activeTabId, onTabChange],
  );

  return (
    <>
      <AdminPageShell header={header}>
        {isPending ? (
          <div className="flex items-center justify-center py-16" data-testid="tenant-loading">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTabId === 'usage' && <UsageTab />}
            {activeTabId === 'api' && <ApiTab />}
          </>
        )}
      </AdminPageShell>

      {renaming && (
        <TenantRenameDialog value={renameValue} onValueChange={setRenameValue} onClose={() => setRenaming(false)} />
      )}
    </>
  );
}
