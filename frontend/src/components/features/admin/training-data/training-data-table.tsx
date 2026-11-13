import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/shared/context-menu';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Pagination } from '@/components/shared/pagination';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { TrainingDataFile } from '@/types/training-data.types';
import { formatDateTimeMinutes } from './training-data-files-helper';

/** 名前変更の入力中の値（ファイル ID ごと） */
export type EditingNames = Record<string, { displayName: string; reference: string }>;

interface TrainingDataTableProps {
  files: TrainingDataFile[];
  selectedFiles: TrainingDataFile[];
  isRenamingMode: boolean;
  editingNames: EditingNames;
  showDownload?: boolean;
  totalPages: number;
  currentPage: number;
  onSelectAllChange: (checked: boolean) => void;
  onToggleItemSelection: (row: TrainingDataFile, checked: boolean) => void;
  onUpdateEditingValue: (id: string, field: 'displayName' | 'reference', value: string) => void;
  onDownload?: (row: TrainingDataFile) => void;
  onEditLearningData: (row: TrainingDataFile) => void;
  onToggleLearning: (row: TrainingDataFile) => void;
  onDeleteFile: (row: TrainingDataFile) => void;
  onPageChange: (page: number) => void;
}

/** 移植元 `<app-training-data-table>`。学習データ（ファイル）の一覧表 */
export function TrainingDataTable({
  files,
  selectedFiles,
  isRenamingMode,
  editingNames,
  showDownload = false,
  totalPages,
  currentPage,
  onSelectAllChange,
  onToggleItemSelection,
  onUpdateEditingValue,
  onDownload,
  onEditLearningData,
  onToggleLearning,
  onDeleteFile,
  onPageChange,
}: TrainingDataTableProps) {
  const { t } = useTranslation();

  const allSelected = files.length > 0 && selectedFiles.length === files.length;
  const someSelected = selectedFiles.length > 0 && !allSelected;
  const isSelected = (id: string) => selectedFiles.some((item) => item.id === id);

  return (
    <>
      <TableList>
        {/* PC のヘッダー */}
        <TableListItem
          isHeader
          showCheckbox
          checked={allSelected}
          indeterminate={someSelected}
          className="hidden md:flex"
          actions={
            <div className="hidden md:flex items-center justify-center gap-2 invisible">
              {showDownload && <div className="w-9 h-9"></div>}
              <div className="w-9 h-9"></div>
            </div>
          }
          onCheckedChange={onSelectAllChange}
        >
          <span className="table-list-col-content table-list-label">
            {t('LEARNING_DATA.COLUMN_DISPLAY_NAME')}
          </span>
          <span className="table-list-col-date table-list-label md:w-60">
            {t('LEARNING_DATA.COLUMN_LINK_NAME')}
          </span>
          <span className="table-list-col-date table-list-label md:w-30">
            {t('LEARNING_DATA.COLUMN_UPDATED_AT')}
          </span>
          <span className="table-list-col-date table-list-label md:w-30">
            {t('LEARNING_DATA.COLUMN_UPDATED_BY')}
          </span>
          <span className="table-list-col-date table-list-label md:w-16">
            {t('LEARNING_DATA.COLUMN_LEARNING')}
          </span>
        </TableListItem>

        {/* モバイルのヘッダー */}
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

        {files.map((row) => {
          const editing = isRenamingMode ? editingNames[row.id] : undefined;
          return (
            <TableListItem
              key={row.id}
              showCheckbox
              checked={isSelected(row.id)}
              dataTestid="training-data-file-row"
              actions={
                <div className="flex flex-col md:flex-row items-center justify-center gap-2">
                  {showDownload && (
                    <IconButton
                      variant="tertiary-gray"
                      size="largePc"
                      className="md:w-9! md:h-9!"
                      ariaLabel={t('LEARNING_DATA.DOWNLOAD')}
                      dataTestid="training-data-file-download-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownload?.(row);
                      }}
                    >
                      <SvgIcon name="fileDownload" className="icon-20" />
                    </IconButton>
                  )}

                  <ContextMenu
                    panelClass="dropdown-menu dropdown-menu--bordered w-70"
                    menuMinWidth=""
                    closeOnContentClick={false}
                    triggerTestid="training-data-file-menu-button"
                    menu={({ close }) => (
                      <>
                        <button
                          type="button"
                          className="dropdown-item"
                          role="menuitem"
                          data-testid="training-data-file-edit-settings"
                          onClick={() => {
                            onEditLearningData(row);
                            close();
                          }}
                        >
                          <span className="dropdown-item-icon">
                            <SvgIcon name="edit" className="w-5 h-5" />
                          </span>
                          {t('LEARNING_DATA.EDIT_LEARNING_DATA_SETTINGS')}
                        </button>
                        {showDownload && (
                          <button
                            type="button"
                            className="dropdown-item"
                            role="menuitem"
                            data-testid="training-data-file-menu-download"
                            onClick={() => {
                              onDownload?.(row);
                              close();
                            }}
                          >
                            <span className="dropdown-item-icon">
                              <SvgIcon name="fileDownload" className="w-5 h-5" />
                            </span>
                            {t('LEARNING_DATA.DOWNLOAD')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="dropdown-item"
                          role="menuitem"
                          data-testid="training-data-file-toggle-learning"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleLearning(row);
                          }}
                        >
                          <span className="dropdown-item-icon">
                            <SvgIcon
                              name={row.status === 'ENABLE' ? 'newRemove' : 'checkCircle'}
                              className="w-5 h-5"
                            />
                          </span>
                          {row.status === 'ENABLE'
                            ? t('LEARNING_DATA.SET_LEARNING_OFF')
                            : t('LEARNING_DATA.SET_LEARNING_ON')}
                        </button>

                        <hr className="dropdown-divider" />

                        <button
                          type="button"
                          className="dropdown-item dropdown-item--danger"
                          role="menuitem"
                          data-testid="training-data-file-menu-delete"
                          onClick={() => {
                            onDeleteFile(row);
                            close();
                          }}
                        >
                          <span className="dropdown-item-icon">
                            <SvgIcon name="delete" className="w-5 h-5" />
                          </span>
                          {t('LEARNING_DATA.DELETE_FROM_FOLDER')}
                        </button>
                      </>
                    )}
                  />
                </div>
              }
              onCheckedChange={(checked) => onToggleItemSelection(row, checked)}
            >
              <div className="table-list-col-content table-list-start-label">
                {editing ? (
                  <input
                    type="text"
                    className="input-parts-field h-9 px-3 text-body-small w-full"
                    value={editing.displayName}
                    aria-label="学習データの表示名"
                    onChange={(event) =>
                      onUpdateEditingValue(row.id, 'displayName', event.target.value)
                    }
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <p className="table-list-title text-label-large md:text-label-x-large">
                    {row.displayName}
                  </p>
                )}
              </div>

              <div className="table-list-row-date md:w-60">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('LEARNING_DATA.COLUMN_LINK_NAME')}
                </span>
                {editing ? (
                  <input
                    type="text"
                    className="input-parts-field h-9 px-3 text-body-small flex-1 min-w-0"
                    value={editing.reference}
                    aria-label="参照資料のリンク名"
                    onChange={(event) =>
                      onUpdateEditingValue(row.id, 'reference', event.target.value)
                    }
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <span className="table-list-date flex-1 w-20 md:w-auto text-body-small md:text-body text-text-strong font-normal">
                    {row.reference}
                  </span>
                )}
              </div>

              <div className="table-list-row-date md:w-30">
                <span className="table-list-label md:hidden w-30 md:w-auto font-normal!">
                  {t('LEARNING_DATA.COLUMN_UPDATED_AT')}
                </span>
                <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
                  {formatDateTimeMinutes(row.updatedAt)}
                </span>
              </div>

              <div className="table-list-row-date md:w-30">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('LEARNING_DATA.COLUMN_UPDATED_BY')}
                </span>
                <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
                  {row.updatedBy}
                </span>
              </div>

              <div className="table-list-row-date md:w-16">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('LEARNING_DATA.COLUMN_LEARNING')}
                </span>
                <span
                  className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium"
                  data-learning-status
                >
                  {row.status === 'ENABLE'
                    ? t('LEARNING_DATA.STATUS_ON')
                    : t('LEARNING_DATA.STATUS_OFF')}
                </span>
              </div>
            </TableListItem>
          );
        })}

        {files.length === 0 && (
          <div className="px-4 py-8 text-center text-text-muted">{t('COMMON.NO_DATA')}</div>
        )}
      </TableList>

      <div className="flex justify-center">
        <Pagination
          totalPages={totalPages}
          useQueryParams={false}
          showPageSize={false}
          showFirstLast={false}
          showPageNumbers
          currentPageOverride={currentPage}
          onPageChange={onPageChange}
        />
      </div>
    </>
  );
}
