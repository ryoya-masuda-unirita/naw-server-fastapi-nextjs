import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { AdminTemplate } from '@/types/admin/template.types';

interface TemplateListItemsProps {
  items: AdminTemplate[];
  selectedIds: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAllChange: (checked: boolean) => void;
  onItemSelectChange: (id: string, checked: boolean) => void;
  onEditTemplate: (template: AdminTemplate) => void;
  onDeleteTemplate: (template: AdminTemplate) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。値がない・日付でないときは空 */
function formatUpdatedAt(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 移植元 `<app-template-list-items>`。一覧テーブル本体 */
export function TemplateListItems({
  items,
  selectedIds,
  allSelected,
  someSelected,
  onSelectAllChange,
  onItemSelectChange,
  onEditTemplate,
  onDeleteTemplate,
}: TemplateListItemsProps) {
  const { t } = useTranslation();

  return (
    <TableList>
      <TableListItem
        isHeader
        showCheckbox
        checked={allSelected}
        indeterminate={!allSelected && someSelected}
        className="hidden md:flex"
        onCheckedChange={onSelectAllChange}
        actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
      >
        <span className="table-list-col-content table-list-label">{t('TEMPLATES.NAME')}</span>
        <span className="table-list-col-date table-list-label md:w-91">
          {t('TEMPLATES.SYSTEM_PROMPT')}
        </span>
        <span className="table-list-col-date table-list-label md:w-44">{t('TEMPLATES.TEAMS')}</span>
        <span className="table-list-col-date table-list-label md:w-30">
          {t('TEMPLATES.UPDATED_AT')}
        </span>
      </TableListItem>

      {items.length > 0 && (
        <TableListItem
          isHeader
          showCheckbox
          checked={allSelected}
          indeterminate={someSelected}
          className="flex md:hidden"
          onCheckedChange={onSelectAllChange}
        >
          <span className="table-list-label">{t('COMMON.SELECT_ALL')}</span>
        </TableListItem>
      )}

      {items.map((item) => (
        <TableListItem
          key={item.id}
          showCheckbox
          checked={selectedIds.has(item.id)}
          onCheckedChange={(checked) => onItemSelectChange(item.id, checked)}
          actions={
            <div className="relative">
              <ContextMenu
                triggerTestid={`template-menu-${item.id}`}
                panelClass="dropdown-menu dropdown-menu--bordered w-[280px]"
                menu={({ close }) => (
                  <>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-secondary transition-colors w-full text-left"
                        onClick={() => {
                          onEditTemplate(item);
                          close();
                        }}
                      >
                        <SvgIcon name="edit" className="w-5 h-5 text-text-strong shrink-0" />
                        <span className="text-label text-text-strong truncate">
                          {t('TEMPLATES.EDIT_ACTION')}
                        </span>
                      </button>
                    </div>
                    <hr className="border-border-weak my-1" />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="flex items-center gap-2 h-9 px-2 py-1 rounded-lg hover:bg-bg-error transition-colors w-full text-left"
                        onClick={() => {
                          onDeleteTemplate(item);
                          close();
                        }}
                      >
                        <SvgIcon name="delete" className="w-5 h-5 text-status-error shrink-0" />
                        <span className="text-label text-status-error truncate">
                          {t('TEMPLATES.DELETE_ACTION')}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              />
            </div>
          }
        >
          <div className="table-list-col-content table-list-start-label">
            <p className="table-list-title text-label-large md:text-label-x-large">{item.name}</p>
            {item.description && <p className="table-list-desc">{item.description}</p>}
          </div>

          <div className="table-list-row-date md:w-91">
            <span className="table-list-label md:hidden w-30 md:w-auto">
              {t('TEMPLATES.SYSTEM_PROMPT')}
            </span>
            <span className="table-list-date flex-1 w-20 md:w-auto block">{item.systemPrompt}</span>
          </div>

          <div className="table-list-row-date md:w-44">
            <span className="table-list-label md:hidden w-30 md:w-auto">{t('TEMPLATES.TEAMS')}</span>
            <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong font-normal">
              {item.teams.join(', ')}
            </span>
          </div>

          <div className="table-list-row-date md:w-30">
            <span className="table-list-label md:hidden w-30 md:w-auto">
              {t('TEMPLATES.UPDATED_AT')}
            </span>
            <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
              {formatUpdatedAt(item.updatedAt)}
            </span>
          </div>
        </TableListItem>
      ))}

      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-text-muted">{t('TEMPLATES.NO_DATA')}</div>
      )}
    </TableList>
  );
}
