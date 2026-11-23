import { useEffect } from 'react';
import { LibraryContentTab } from '@/components/features/admin/library/library-content-tab';
import { LibraryTagsTab } from '@/components/features/admin/library/library-tags-tab';
import { PageHeader } from '@/components/shared/page-header';
import type { TabItem } from '@/components/shared/types';
import { useTabQueryParam } from '@/hooks/use-tab-query-param';
import { useAuthStore } from '@/store/auth-store';

const LIBRARY_TABS = ['contents', 'tags'] as const;
type LibraryTab = (typeof LIBRARY_TABS)[number];

const TAB_ITEMS: TabItem[] = [
  { id: 'contents', label: 'ADMIN.LIBRARY.TAB_CONTENTS' },
  { id: 'tags', label: 'ADMIN.LIBRARY.TAB_TAGS' },
];

/** 移植元 `AdminLibraryComponent`（library-list）。ライブラリ一覧（コンテンツ・タグの 2 タブ） */
export function AdminLibraryPage() {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const tabState = useTabQueryParam<LibraryTab>({ validTabs: LIBRARY_TABS, defaultTab: 'contents' });
  const { onTabChange } = tabState;

  // 一般ユーザーは tags タブに入れない。URL 直指定で入っても表示は contents にし、URL も contents へ正規化する
  const activeTabId: LibraryTab = tabState.activeTabId === 'tags' && !isAdmin ? 'contents' : tabState.activeTabId;
  useEffect(() => {
    if (!isAdmin && tabState.activeTabId === 'tags') onTabChange({ id: 'contents' });
  }, [isAdmin, tabState.activeTabId, onTabChange]);

  return (
    <div className="block">
      <PageHeader
        title=""
        titleKey="ADMIN.LIBRARY.TITLE"
        showSidebarToggle
        showActions={false}
        showLanguageToggle
        showBackButton={false}
        tabs={isAdmin ? TAB_ITEMS : []}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
      />

      {activeTabId === 'contents' && <LibraryContentTab />}
      {activeTabId === 'tags' && <LibraryTagsTab />}
    </div>
  );
}
