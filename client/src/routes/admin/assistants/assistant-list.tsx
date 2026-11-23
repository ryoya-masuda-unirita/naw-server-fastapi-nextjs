import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssistantTab } from '@/components/features/admin/assistants/assistant-tab';
import { CategoryTab } from '@/components/features/admin/assistants/category-tab';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { PageHeader } from '@/components/shared/page-header';
import type { TabItem } from '@/components/shared/types';
import { useTabQueryParam } from '@/hooks/use-tab-query-param';
import { useAssistantListStore } from '@/store/assistant-list-store';
import { useAuthStore } from '@/store/auth-store';

const TAB_ASSISTANT = 'assistant';
const TAB_CATEGORY = 'assistant-category';
const VALID_TABS = [TAB_ASSISTANT, TAB_CATEGORY] as const;

const TABS: TabItem[] = [
  { id: TAB_ASSISTANT, label: 'ADMIN.ASSISTANT.TAB_ASSISTANT_LIST' },
  { id: TAB_CATEGORY, label: 'ADMIN.ASSISTANT.TAB_CATEGORY_MANAGEMENT' },
];

/** 移植元 `AdminAssistantListComponent`（assistant-list）。アシスタント管理（アシスタント一覧・カテゴリ管理の 2 タブ） */
export function AdminAssistantListPage() {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const reset = useAssistantListStore((state) => state.reset);
  const { activeTabId, onTabChange } = useTabQueryParam({
    validTabs: VALID_TABS,
    defaultTab: TAB_ASSISTANT,
  });
  // 選択の有無は、どのタブのものかも持つ（移植元はタブを切り替えるとタブごと作り直すので、選択も消える）
  const [selection, setSelection] = useState({ tab: '', active: false });
  const hasSelection = selection.tab === activeTabId && selection.active;
  const handleSelectionActiveChange = useCallback(
    (active: boolean) => setSelection({ tab: activeTabId, active }),
    [activeTabId],
  );

  // 画面を離れたら検索・ページ・並べ替えを捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => reset, [reset]);

  // 移植元はテナント管理者だけにタブを出す（グループ管理者は一覧だけ）
  const tabs = useMemo(() => (isAdmin ? TABS : []), [isAdmin]);

  return (
    <AdminPageShell
      header={
        <PageHeader
          title=""
          titleKey="SIDEBAR.ASSISTANTS"
          showSidebarToggle
          showActions={false}
          showLanguageToggle
          showBackButton={false}
          tabs={tabs}
          activeTabId={activeTabId}
          onTabChange={onTabChange}
        />
      }
      mainClass={hasSelection ? 'pb-[153px] md:pb-0' : 'pb-[87px] md:pb-0'}
    >
      {activeTabId === TAB_ASSISTANT && <AssistantTab key={TAB_ASSISTANT} onSelectionActiveChange={handleSelectionActiveChange} />}
      {activeTabId === TAB_CATEGORY && <CategoryTab key={TAB_CATEGORY} onSelectionActiveChange={handleSelectionActiveChange} />}
    </AdminPageShell>
  );
}
