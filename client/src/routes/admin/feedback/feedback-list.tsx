import { useTranslation } from 'react-i18next';
import { AccuracyTab } from '@/components/features/admin/feedback/accuracy-tab';
import { CountTab } from '@/components/features/admin/feedback/count-tab';
import { SatisfactionTab } from '@/components/features/admin/feedback/satisfaction-tab';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { PageHeader } from '@/components/shared/page-header';
import type { TabItem } from '@/components/shared/types';
import { useTabQueryParam } from '@/hooks/use-tab-query-param';

const FEEDBACK_TABS = ['accuracy', 'satisfaction', 'count'] as const;
type FeedbackTab = (typeof FEEDBACK_TABS)[number];

const TAB_ITEMS: TabItem[] = [
  { id: 'accuracy', label: 'FEEDBACK.TAB_ACCURACY' },
  { id: 'satisfaction', label: 'FEEDBACK.TAB_SATISFACTION' },
  { id: 'count', label: 'FEEDBACK.TAB_COUNT' },
];

/** 移植元 `AdminFeedbackListComponent`（feedback-list）。フィードバック管理（精度・満足度・回答数の 3 タブ） */
export function AdminFeedbackListPage() {
  const { t } = useTranslation();
  const { activeTabId, onTabChange } = useTabQueryParam<FeedbackTab>({
    validTabs: FEEDBACK_TABS,
    defaultTab: 'accuracy',
  });

  return (
    <AdminPageShell
      header={
        <PageHeader
          title={t('SIDEBAR.FEEDBACK')}
          showSidebarToggle
          showActions={false}
          showLanguageToggle
          showBackButton={false}
          tabs={TAB_ITEMS}
          activeTabId={activeTabId}
          onTabChange={onTabChange}
        />
      }
    >
      {activeTabId === 'accuracy' && <AccuracyTab />}
      {activeTabId === 'satisfaction' && <SatisfactionTab />}
      {activeTabId === 'count' && <CountTab />}
    </AdminPageShell>
  );
}
