import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { GROUP_DETAIL_TABS, ROUTES } from '@/lib/constants/routes';
import type { GroupListItem } from '@/types/admin/group-management.types';

interface GroupListCardsProps {
  items: GroupListItem[];
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。日付でないときは空 */
function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatNames(names: string[]): string {
  return names.length === 0 ? '—' : names.join('、');
}

/** 移植元 `<app-group-list-cards>`。グループごとのカード */
export function GroupListCards({ items }: GroupListCardsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="term-cards">
      {items.map((item) => (
        <div key={item.id} className="term-card" data-testid="admin-groups-list-card">
          <div className="flex items-center justify-between">
            <div className="term-card-name">{item.name}</div>
          </div>
          <div className="term-card-body">
            <div className="term-card-row">
              <div className="term-card-label">{t('GROUPS.ADMINISTRATOR')}</div>
              <div className="term-card-text">{formatNames(item.adminUserNames)}</div>
            </div>
            <div className="term-card-row">
              <div className="term-card-label">{t('GROUPS.ASSIGNED_USERS')}</div>
              <div className="term-card-text">{formatNames(item.userNames)}</div>
            </div>
            <div className="term-card-row">
              <div className="term-card-label">{t('GROUPS.ASSIGNED_ASSISTANTS')}</div>
              <div className="term-card-text">{formatNames(item.assistants)}</div>
            </div>
            <div className="term-card-row">
              <div className="term-card-label">{t('GROUPS.ASSIGNED_TEMPLATES')}</div>
              <div className="term-card-text">{formatNames(item.templates)}</div>
            </div>
            {item.updatedAt && (
              <div className="term-card-row">
                <div className="term-card-label">{t('GROUPS.UPDATED_AT')}</div>
                <div className="term-card-text">{formatUpdatedAt(item.updatedAt)}</div>
              </div>
            )}
            <div className="term-card-actions">
              <Button
                variant="outline"
                size="lg"
                type="button"
                dataTestid="admin-groups-view-edit-button"
                onClick={() =>
                  navigate(ROUTES.APP.ADMIN_GROUP_DETAIL_TAB(item.id, GROUP_DETAIL_TABS.USERS))
                }
              >
                <SvgIcon name="edit" className="w-5 h-5" />
                {t('GROUPS.VIEW_AND_EDIT')}
              </Button>
            </div>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('GROUPS.NO_DATA')}</div>
      )}
    </div>
  );
}
