import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { ChunkSelect } from '@/components/shared/chunk-select';
import { FileUpload } from '@/components/shared/file-upload';
import { IconButton } from '@/components/shared/icon-button';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { resolveControlError } from '@/lib/utils/form-errors';
import { validateAddRow, type AddFileField, type AddFileRow } from './training-data-validation';

interface TrainingDataAddModalProps {
  rows: AddFileRow[];
  linkPrefix: string;
  submitted: boolean;
  onFilesSelected: (files: File[]) => void;
  onRowChange: (index: number, field: AddFileField, value: string) => void;
  onRemoveFile: (index: number) => void;
  onLinkPrefixChange: (value: string) => void;
  onApplyLinkPrefix: () => void;
}

const ROW_INPUT_CLASS =
  'input-parts-field h-9 px-3 py-2 rounded-lg border border-border-strong bg-white focus:outline-none focus:border-brand-primary text-label text-text-strong w-full';

/** 移植元 `<app-training-data-add-modal>`。複数ファイルをまとめて追加するダイアログの中身 */
export function TrainingDataAddModal({
  rows,
  linkPrefix,
  submitted,
  onFilesSelected,
  onRowChange,
  onRemoveFile,
  onLinkPrefixChange,
  onApplyLinkPrefix,
}: TrainingDataAddModalProps) {
  const { t } = useTranslation();

  const rowError = (row: AddFileRow, field: AddFileField) =>
    resolveControlError({ touched: submitted, errors: validateAddRow(row, field) }, t);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6 md:text-label-x-large">
        <div className="flex gap-1 items-start md:gap-2">
          <span className="shrink-0 h-5" aria-hidden="true">
            <SvgIcon name="lightbulb" className="icon-20 text-brand-primary" />
          </span>
          <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium text-text-strong">
            {t('LEARNING_DATA.CHUNK_INFO_TITLE')}
          </p>
        </div>
        <p className="text-body-small text-text-strong">{t('LEARNING_DATA.CHUNK_INFO_TEXT')}</p>
      </div>

      <FileUpload variant="full" onFilesSelected={onFilesSelected} />

      {rows.length > 0 && (
        <div className="flex flex-col">
          <div className="flex flex-col w-full">
            <div className="table-list-row table-list-row--header">
              <div className="table-list-row-content">
                <span className="table-list-col-content table-list-label">
                  {t('LEARNING_DATA.UPLOAD_FILE_NAME')}
                </span>
                <span className="table-list-col-date table-list-label md:w-60">
                  {t('LEARNING_DATA.UPLOAD_COLUMN_DISPLAY_NAME')}
                </span>
                <span className="table-list-col-date table-list-label md:w-60">
                  {t('LEARNING_DATA.UPLOAD_COLUMN_LINK_NAME')}
                </span>
                <span className="table-list-col-date table-list-label md:w-30">
                  {t('LEARNING_DATA.UPLOAD_COLUMN_CHUNK_SIZE')}
                </span>
                <span className="table-list-col-date table-list-label md:w-30">
                  {t('LEARNING_DATA.UPLOAD_STATUS')}
                </span>
              </div>
              <div className="table-list-actions">
                <div className="w-9 h-9"></div>
              </div>
            </div>

            {rows.map((row, index) => {
              const displayNameError = rowError(row, 'displayName');
              const referenceError = rowError(row, 'reference');
              const chunkSizeError = rowError(row, 'chunkSize');
              return (
                <div
                  key={row.key}
                  className="table-list-row table-list-row--data hover:bg-bg-secondary/30 transition-colors border-b border-border-weak items-start"
                  data-testid="training-data-add-row"
                >
                  <div className="table-list-row-content items-start">
                    <div className="table-list-col-content">
                      <div className="h-9 flex items-center">
                        <span className="text-label text-text-medium truncate" title={row.file.name}>
                          {row.file.name}
                        </span>
                      </div>
                    </div>
                    <div className="table-list-col-date md:w-60 flex flex-col gap-1">
                      <input
                        type="text"
                        value={row.displayName}
                        className={`${ROW_INPUT_CLASS}${displayNameError ? ' !border-status-error' : ''}`}
                        aria-label={t('LEARNING_DATA.UPLOAD_COLUMN_DISPLAY_NAME')}
                        data-testid="training-data-add-display-name"
                        onChange={(event) => onRowChange(index, 'displayName', event.target.value)}
                      />
                      {displayNameError && (
                        <span className="text-[10px] text-status-error leading-tight px-1">
                          {displayNameError}
                        </span>
                      )}
                    </div>
                    <div className="table-list-col-date md:w-60 flex flex-col gap-1">
                      <input
                        type="text"
                        value={row.reference}
                        className={`${ROW_INPUT_CLASS}${referenceError ? ' !border-status-error' : ''}`}
                        aria-label={t('LEARNING_DATA.UPLOAD_COLUMN_LINK_NAME')}
                        data-testid="training-data-add-reference"
                        onChange={(event) => onRowChange(index, 'reference', event.target.value)}
                      />
                      {referenceError && (
                        <span className="text-[10px] text-status-error leading-tight px-1">
                          {referenceError}
                        </span>
                      )}
                    </div>
                    <div className="table-list-col-date md:w-30 flex flex-col gap-1">
                      <ChunkSelect
                        size="small"
                        className="w-full"
                        value={row.chunkSize || null}
                        error={chunkSizeError ? ' ' : ''}
                        onValueChange={(value) => onRowChange(index, 'chunkSize', value ?? '')}
                      />
                      {chunkSizeError && (
                        <span className="text-[10px] text-status-error leading-tight px-1">
                          {chunkSizeError}
                        </span>
                      )}
                    </div>
                    <div className="table-list-col-date md:w-30">
                      <div className="h-9 flex items-center">
                        <span className="text-label text-text-medium whitespace-nowrap font-medium">
                          {t('LEARNING_DATA.WAITING')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="table-list-actions items-start">
                    <IconButton
                      variant="tertiary-gray"
                      size="large"
                      dataTestid="training-data-add-remove"
                      onClick={() => onRemoveFile(index)}
                    >
                      <SvgIcon name="delete" className="icon-20 w-5 h-5 text-text-medium" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 items-end mt-6">
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <div className="flex flex-col">
                <label
                  htmlFor="link-prefix-input"
                  className="text-label-large font-medium text-text-strong mb-1"
                >
                  {t('LEARNING_DATA.LINK_PREFIX_LABEL')}
                </label>
              </div>
              <input
                id="link-prefix-input"
                type="text"
                value={linkPrefix}
                placeholder={t('LEARNING_DATA.LINK_PREFIX_PLACEHOLDER')}
                className="input-parts-field h-12 w-full px-4 rounded-lg border border-border-strong bg-bg-primary text-body text-text-strong focus:outline-none focus:border-brand-primary"
                data-testid="training-data-add-link-prefix"
                onChange={(event) => onLinkPrefixChange(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="lg"
              className="shrink-0 h-13.5 text-xs! font-bold!"
              dataTestid="training-data-add-apply-prefix"
              onClick={onApplyLinkPrefix}
            >
              {t('LEARNING_DATA.APPLY_ALL')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
