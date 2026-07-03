import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <h1 className="text-h1 text-text-default">{t('SIDEBAR.DASHBOARD')}</h1>
    </div>
  );
}
