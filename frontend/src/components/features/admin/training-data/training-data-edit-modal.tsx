import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChunkSelect } from '@/components/shared/chunk-select';
import { FormInput } from '@/components/shared/form-input';
import { FormSwitch } from '@/components/shared/form-switch';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { resolveControlError } from '@/lib/utils/form-errors';
import type { TrainingDataFile } from '@/types/training-data.types';
import {
  validateEditField,
  type EditFileField,
  type EditFileValues,
} from './training-data-validation';

interface TrainingDataEditModalProps {
  values: EditFileValues;
  submitted: boolean;
  /** 編集中のファイル。追加のとき（スマートフォンの追加）は null */
  editingFile: TrainingDataFile | null;
  editFilePreview: string | null;
  onChange: (values: EditFileValues) => void;
  onEditFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePreview: () => void;
}

/** 移植元 `<app-training-data-edit-modal>`。学習データ 1 件の設定を編集する（スマートフォンでは追加にも使う） */
export function TrainingDataEditModal({
  values,
  submitted,
  editingFile,
  editFilePreview,
  onChange,
  onEditFileChange,
  onRemovePreview,
}: TrainingDataEditModalProps) {
  const { t } = useTranslation();

  const fieldError = (field: EditFileField) =>
    resolveControlError({ touched: submitted, errors: validateEditField(values, field) }, t);
  const chunkSizeError = fieldError('chunkSize');

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6">
        <div className="flex gap-1 items-start md:gap-2">
          <span className="shrink-0 h-5" aria-hidden="true">
            <SvgIcon name="lightbulb" className="icon-20 text-brand-primary" />
          </span>
          <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium">
            {t('LEARNING_DATA.CHUNK_INFO_TITLE')}
          </p>
        </div>
        <p className="text-body-small">{t('LEARNING_DATA.CHUNK_INFO_TEXT')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-default leading-[1.4]">
          {t('LEARNING_DATA.EDIT_DATA_UPLOAD_FILE_LABEL')}
        </span>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-center sm:justify-start gap-3 md:gap-6">
          {editFilePreview && (
            <div className="relative shrink-0 w-40 h-40 rounded-xl overflow-hidden bg-bg-brand-weak border border-border-strong">
              <img
                src={editFilePreview}
                alt=""
                className="absolute inset-0 w-full h-full object-fill"
              />
              <button
                type="button"
                className="absolute top-0.75 right-0.75 w-4.5 h-4.5 rounded-full bg-text-strong flex items-center justify-center text-text-white cursor-pointer hover:bg-text-default transition-colors"
                aria-label="ファイルを削除"
                onClick={onRemovePreview}
              >
                <SvgIcon name="close" className="w-3! h-3!" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1 items-center">
            {editFilePreview && editingFile?.displayName && (
              <p className="text-label text-text-medium font-medium max-w-48 truncate">
                {editingFile.displayName}
              </p>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept="*"
                data-testid="training-data-edit-file-input"
                onChange={onEditFileChange}
              />
              <span className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-full border border-border-brand bg-bg-primary text-brand-primary text-sm font-medium hover:bg-bg-brand-weak hover:border-brand-secondary hover:text-brand-secondary transition-colors">
                <SvgIcon name="fileUpload" className="icon-20" />
                <span className="leading-[1.4]">{t('LEARNING_DATA.UPLOAD_FILE_BUTTON')}</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <FormInput
        id="edit-display-name"
        label={t('LEARNING_DATA.EDIT_DATA_DISPLAY_NAME_LABEL')}
        placeholder={t('LEARNING_DATA.EDIT_DATA_DISPLAY_NAME_PLACEHOLDER')}
        value={values.displayName}
        error={fieldError('displayName')}
        dataTestid="training-data-edit-display-name"
        onValueChange={(displayName) => onChange({ ...values, displayName })}
      />

      <FormInput
        id="edit-link-name"
        label={t('LEARNING_DATA.EDIT_DATA_LINK_NAME_LABEL')}
        placeholder={t('LEARNING_DATA.EDIT_DATA_LINK_NAME_PLACEHOLDER')}
        value={values.reference}
        error={fieldError('reference')}
        dataTestid="training-data-edit-reference"
        onValueChange={(reference) => onChange({ ...values, reference })}
      />

      <fieldset className="flex flex-col gap-3 group">
        <div className="fieldset-head">
          <span className="fieldset-title">{t('LEARNING_DATA.EDIT_DATA_CHUNK_SIZE_LABEL')}</span>
        </div>
        <ChunkSelect
          placeholder={t('LEARNING_DATA.EDIT_DATA_CHUNK_SIZE_PLACEHOLDER')}
          size="lg"
          className="w-full"
          value={values.chunkSize || null}
          error={chunkSizeError ? ' ' : ''}
          onValueChange={(chunkSize) => onChange({ ...values, chunkSize: chunkSize ?? '' })}
        />
        {chunkSizeError && <span className="text-xs text-status-error">{chunkSizeError}</span>}
      </fieldset>

      {editingFile && (
        <FormSwitch
          label={t('LEARNING_DATA.EDIT_DATA_LEARNING_SETTING_LABEL')}
          size="lg"
          checked={values.status}
          dataTestid="training-data-edit-status"
          onCheckedChange={(status) => onChange({ ...values, status })}
        />
      )}
    </div>
  );
}
