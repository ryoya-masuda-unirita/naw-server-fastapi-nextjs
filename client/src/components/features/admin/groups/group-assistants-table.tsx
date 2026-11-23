import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { GroupAssistantItem } from '@/types/admin/group-management.types';
import { formatDateTime } from './group-format';

interface GroupAssistantsTableProps {
  items: GroupAssistantItem[];
  selectedIds: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAllChange: (checked: boolean) => void;
  onItemSelectChange: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
}

/** 移植元 `<app-group-assistants-table>`。所属アシスタントの一覧表（所属用語辞書の列は移植元でも非表示） */
export function GroupAssistantsTable({
  items,
  selectedIds,
  allSelected,
  someSelected,
  onSelectAllChange,
  onItemSelectChange,
  onDeleteItem,
}: GroupAssistantsTableProps) {
  const { t } = useTranslation();

  return (
    <TableList>
      {/* 見出し（PC のみ） */}
      <TableListItem
        isHeader
        showCheckbox
        checked={allSelected}
        indeterminate={!allSelected && someSelected}
        className="hidden md:flex"
        onCheckedChange={onSelectAllChange}
        actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
      >
        <span className="table-list-col-content table-list-label">
          {t('TEAM.ASSISTANT.DISPLAY_NAME')}
        </span>
        <span className="table-list-col-date table-list-label md:w-20">
          {t('TEAM.ASSISTANT.SERVER')}
        </span>
        <span className="table-list-col-date table-list-label md:w-30">
          {t('TEAM.ASSISTANT.AI_MODEL')}
        </span>
        <span className="table-list-col-date table-list-label md:w-40">
          {t('TEAM.ASSISTANT.CATEGORY')}
        </span>
        <span className="table-list-col-date table-list-label md:w-16">
          {t('TEAM.ASSISTANT.HISTORY_SHARING')}
        </span>
        <span className="table-list-col-date table-list-label md:w-30">
          {t('TEAM.ASSISTANT.ADDED_AT')}
        </span>
      </TableListItem>

      {items.map((item) => {
        const categories = item.categories ?? (item.category ? [item.category] : []);
        return (
          <TableListItem
            key={item.id}
            showCheckbox
            checked={selectedIds.has(item.id)}
            dataTestid="admin-groups-assistant-row"
            onCheckedChange={(checked) => onItemSelectChange(item.id, checked)}
            actions={
              <div>
                <IconButton
                  variant="tertiary-gray"
                  size="largePc"
                  ariaLabel={t('COMMON.DELETE')}
                  dataTestid="admin-groups-remove-assistant-button"
                  onClick={() => onDeleteItem(item.id)}
                >
                  <SvgIcon name="delete" className="w-5 h-5" />
                </IconButton>
              </div>
            }
          >
            <div className="table-list-col-content table-list-start-label">
              <p className="table-list-title text-label-large md:text-label-x-large">{item.name}</p>
              <p className="table-list-desc">{item.description}</p>
            </div>
            <div className="table-list-row-date md:w-20">
              <span className="table-list-label md:hidden w-20 md:w-auto">
                {t('TEAM.ASSISTANT.SERVER')}
              </span>
              <span className="table-list-date flex-1 w-20 md:w-auto">{item.serverLabel}</span>
            </div>
            <div className="table-list-row-date md:w-30">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('TEAM.ASSISTANT.AI_MODEL')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                {item.endpointLabel}
              </span>
            </div>
            <div className="table-list-row-date md:w-40">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('TEAM.ASSISTANT.CATEGORY')}
              </span>
              <div className="flex-1 w-30 md:w-auto text-[0px]">
                {categories.map((category) => (
                  <span
                    key={category.id}
                    className="assistant-tag font-medium leading-[1.4] inline-flex items-baseline rounded p-1 border border-gray-400 text-[10px] text-text-medium"
                  >
                    {category.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="table-list-row-date md:w-16">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('TEAM.ASSISTANT.HISTORY_SHARING')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto">{item.historyLabel}</span>
            </div>
            <div className="table-list-row-date md:w-30">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('TEAM.ASSISTANT.ADDED_AT')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
                {formatDateTime(item.addedAt)}
              </span>
            </div>
          </TableListItem>
        );
      })}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('TEAM.ASSISTANT.NO_ITEMS')}</div>
      )}
    </TableList>
  );
}
