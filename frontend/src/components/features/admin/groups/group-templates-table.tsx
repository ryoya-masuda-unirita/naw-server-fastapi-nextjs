import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { TemplateApiItem } from '@/types/admin/template.types';
import { formatDateTime } from './group-format';

interface GroupTemplatesTableProps {
  items: TemplateApiItem[];
  selectedIds: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAllChange: (checked: boolean) => void;
  onItemSelectChange: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
}

/** 移植元 `<app-group-templates-table>`。所属テンプレートの一覧表 */
export function GroupTemplatesTable({
  items,
  selectedIds,
  allSelected,
  someSelected,
  onSelectAllChange,
  onItemSelectChange,
  onDeleteItem,
}: GroupTemplatesTableProps) {
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
          {t('TEAM.TEMPLATE.TEMPLATE_NAME')}
        </span>
        <span className="table-list-col-date table-list-label md:w-94">
          {t('TEAM.TEMPLATE.SYSTEM_PROMPT')}
        </span>
        <span className="table-list-col-date table-list-label md:w-30">
          {t('TEAM.TEMPLATE.UPDATED_AT')}
        </span>
      </TableListItem>

      {items.map((item) => (
        <TableListItem
          key={item.id}
          showCheckbox
          checked={selectedIds.has(item.id)}
          dataTestid="admin-groups-template-row"
          onCheckedChange={(checked) => onItemSelectChange(item.id, checked)}
          actions={
            <div>
              <IconButton
                variant="tertiary-gray"
                size="largePc"
                ariaLabel={t('COMMON.DELETE')}
                dataTestid="admin-groups-remove-template-button"
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
          <div className="table-list-row-date md:w-94">
            <span className="table-list-label md:hidden w-30 md:w-auto">
              {t('TEAM.TEMPLATE.SYSTEM_PROMPT')}
            </span>
            {/* 移植元は innerHTML。タグ付きの文字列を HTML として解釈させないよう、テキストで出す */}
            <span className="table-list-date flex-1 w-20 md:w-auto line-clamp-1 md:line-clamp-3 whitespace-break-spaces">
              {item.systemPrompt}
            </span>
          </div>
          <div className="table-list-row-date md:w-30">
            <span className="table-list-label md:hidden w-30 md:w-auto">
              {t('TEAM.TEMPLATE.UPDATED_AT')}
            </span>
            <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
              {formatDateTime(item.updatedAt)}
            </span>
          </div>
        </TableListItem>
      ))}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('TEAM.TEMPLATE.NO_ITEMS')}</div>
      )}
    </TableList>
  );
}
