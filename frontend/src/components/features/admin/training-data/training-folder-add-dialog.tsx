import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormRadio } from '@/components/shared/form-radio';
import { FormSelect } from '@/components/shared/form-select';
import { FormTextarea } from '@/components/shared/form-textarea';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import type { SelectOption } from '@/components/shared/types';
import {
  listAllGroupIds,
  loadEndpointsForType,
  useCreateTrainingFolder,
} from '@/hooks/use-training-data';
import { resolveControlError, type FieldErrors } from '@/lib/utils/form-errors';
import { scrollToFirstFormError } from '@/lib/utils/scroll-to-error';
import type { TrainingDataFilter } from '@/types/training-data.types';
import { buildIndexPayload, type TrainingFolderType } from './training-folder-form';

/** 移植元 `openCreateModal` のフォームの Validators */
const NAME_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1000;

/** 移植元 `dialog.open` の `width: '800px', maxWidth: '90vw'` */
const DIALOG_WIDTH = 'min(800px, 90vw)';

/** クラウド接続のとき、ベクトル DB と埋め込みモデルの 2 つを送る */
const SAAS_GLOBAL_ENDPOINT_COUNT = 2;

type FieldName = 'name' | 'description' | 'endpointId' | 'fetchId' | 'deleteId' | 'learnId';

/** 先頭から順に、不正な項目までスクロールする（移植元 `submitCreateFolder`） */
const SCROLL_FIELDS: { controlName: FieldName; elementId: string }[] = [
  { controlName: 'name', elementId: 'create-folder-name' },
  { controlName: 'description', elementId: 'create-folder-description' },
  { controlName: 'endpointId', elementId: 'create-folder-endpoint' },
  { controlName: 'fetchId', elementId: 'create-folder-fetch-id' },
  { controlName: 'deleteId', elementId: 'create-folder-delete-id' },
  { controlName: 'learnId', elementId: 'create-folder-learn-id' },
];

/** Angular の Validators.required・maxLength と同じ判定（required は空文字だけを弾く） */
function validateText(value: string, maxLength: number | null, required: boolean): FieldErrors | null {
  if (required && value.length === 0) return { required: true };
  if (maxLength !== null && value.length > maxLength) {
    return { maxlength: { requiredLength: maxLength, actualLength: value.length } };
  }
  return null;
}

interface TrainingFolderAddDialogProps {
  /** 一覧の現在の条件。作成したフォルダをこの一覧の先頭に足す */
  filter: TrainingDataFilter;
  onClose: () => void;
}

/**
 * 移植元の「学習先フォルダを新規作成」ダイアログ（`openCreateModal` と `createFolderFormTpl`）。
 * 開くたびに入力を空から始めるため、親は開いている間だけ描画する（移植元の `folderModal.reset()` と新しいフォーム）。
 */
export function TrainingFolderAddDialog({ filter, onClose }: TrainingFolderAddDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateTrainingFolder(filter);
  // 連打で二重に作成しないため、state ではなく ref で見る
  const submittingRef = useRef(false);
  const endpointRequestRef = useRef(0);

  const [name, setName] = useState('');
  const [server, setServer] = useState<TrainingFolderType | ''>('');
  const [description, setDescription] = useState('');
  const [fetchId, setFetchId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [learnId, setLearnId] = useState('');
  const [endpointId, setEndpointId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 移植元 `TrainingFolderModalService` の状態
  // グループの取得は開いた直後から始まるため、true から始める
  const [isGroupsLoading, setIsGroupsLoading] = useState(true);
  const [endpointLoadingCount, setEndpointLoadingCount] = useState(0);
  const [endpointOptions, setEndpointOptions] = useState<SelectOption[]>([]);
  const [hasNoEndpoints, setHasNoEndpoints] = useState(false);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const isLoading = isGroupsLoading || endpointLoadingCount > 0;

  // 開いたときに、紐づけるグループを全部取る（移植元 `initializeGroups`）
  useEffect(() => {
    let cancelled = false;
    listAllGroupIds()
      .then((ids) => {
        if (!cancelled) setGroupIds(ids);
      })
      .catch(() => {
        // 失敗の通知は api-client の共通エラートーストが出す。グループなしで続ける（移植元と同じ）
      })
      .finally(() => setIsGroupsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // サービス ID は、クラウドのときだけ必須でない。最初（未選択）とローカルでは必須
  const isLocalOnlyRequired = server !== 'SAAS_GLOBAL';
  const errors: Record<FieldName, FieldErrors | null> = {
    name: validateText(name, NAME_MAX_LENGTH, true),
    description: validateText(description, DESCRIPTION_MAX_LENGTH, false),
    endpointId: validateText(endpointId, null, isLocalOnlyRequired),
    fetchId: validateText(fetchId, null, isLocalOnlyRequired),
    deleteId: validateText(deleteId, null, isLocalOnlyRequired),
    learnId: validateText(learnId, null, isLocalOnlyRequired),
  };
  const isFormValid = server !== '' && Object.values(errors).every((error) => error === null);
  const isCreateFolderValid = isFormValid && !hasNoEndpoints;

  let hasSelectedEndpoint = !!endpointId;
  if (server === 'SAAS_GLOBAL') {
    hasSelectedEndpoint = selectedEndpointIds.length === SAAS_GLOBAL_ENDPOINT_COUNT;
  }
  const canSubmit =
    !isLoading && !hasNoEndpoints && !isSubmitting && !!name && !!server && hasSelectedEndpoint;

  const fieldError = (field: FieldName) =>
    resolveControlError({ touched: submitted, errors: errors[field] }, t);

  const serverOptions = useMemo(
    () => [
      { label: t('LEARNING_DATA.SERVER_LOCAL'), value: 'LOCAL' as const },
      { label: t('LEARNING_DATA.SERVER_CLOUD'), value: 'SAAS_GLOBAL' as const },
    ],
    [t],
  );

  const handleServerChange = async (next: TrainingFolderType) => {
    setServer(next);
    // 続けて切り替えたとき、古い応答で上書きしない
    const requestId = ++endpointRequestRef.current;
    setEndpointLoadingCount((count) => count + 1);
    try {
      const state = await loadEndpointsForType(next);
      if (requestId !== endpointRequestRef.current) return;
      setEndpointOptions(state.options);
      setSelectedEndpointIds(state.selectedEndpointIds);
      setHasNoEndpoints(state.hasNoEndpoints);
      setEndpointId(next === 'LOCAL' ? (state.localEndpointId ?? '') : '');
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。選択は変えない（移植元と同じ）
    } finally {
      setEndpointLoadingCount((count) => count - 1);
    }
  };

  const submit = async () => {
    setSubmitted(true);
    if (!isCreateFolderValid || !canSubmit || submittingRef.current) {
      // エラー文言の描画後にスクロールするため、次のタスクまで待つ
      setTimeout(
        () =>
          scrollToFirstFormError((controlName) => errors[controlName as FieldName] !== null, SCROLL_FIELDS),
        0,
      );
      return;
    }

    const endpointIds = server === 'SAAS_GLOBAL' ? selectedEndpointIds : [endpointId];
    const payload = buildIndexPayload(
      { name, server, description, fetchId, deleteId, learnId },
      groupIds,
      endpointIds,
    );

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await createMutation.mutateAsync(payload);
      onClose();
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。入力を残してダイアログは開いたままにする
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const customActions = (
    <div className="flex gap-3 justify-end max-sm:justify-center">
      <Button
        variant="outline"
        size="lg"
        className="dialog-cancel-btn flex-1"
        fullWidth
        disabled={isSubmitting}
        dataTestid="admin-training-data-create-cancel"
        onClick={onClose}
      >
        {t('COMMON.CANCEL')}
      </Button>
      <Button
        variant="solid"
        size="lg"
        className="flex-1"
        fullWidth
        disabled={!canSubmit}
        loading={isSubmitting}
        dataTestid="admin-training-data-create-submit"
        onClick={() => void submit()}
      >
        {t('COMMON.CREATE')}
      </Button>
    </div>
  );

  return (
    <Dialog
      open
      title={t('LEARNING_DATA.CREATE_NEW_FOLDER')}
      customActions={customActions}
      showDefaultActions={false}
      buttonAlign="right"
      dialogWidth={DIALOG_WIDTH}
      onClose={onClose}
    >
      <div className="relative">
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60"
            data-testid="admin-training-data-create-loading"
          >
            <CircularLoading />
          </div>
        )}
        <form
          className="flex flex-col gap-4 md:gap-6 text-text-strong"
          onSubmit={(event) => event.preventDefault()}
        >
          {server !== 'SAAS_GLOBAL' && (
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6 md:text-label-x-large">
              <div className="flex gap-1 items-start md:gap-2">
                <span className="shrink-0 h-5" aria-hidden="true">
                  <SvgIcon name="lightbulb" className="icon-20 text-brand-primary" />
                </span>
                <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium">
                  {t('LEARNING_DATA.LOCAL_INFO_TITLE')}
                </p>
              </div>
              <p className="text-body-small">{t('LEARNING_DATA.LOCAL_INFO_TEXT')}</p>
            </div>
          )}

          <FormInput
            id="create-folder-name"
            label={t('LEARNING_DATA.FOLDER_NAME_LABEL')}
            placeholder={t('LEARNING_DATA.FOLDER_NAME_PLACEHOLDER')}
            value={name}
            error={fieldError('name')}
            dataTestid="admin-training-data-name-input"
            onValueChange={setName}
          />

          <FormRadio
            label={t('LEARNING_DATA.SERVER_LABEL')}
            layout="vertical"
            options={serverOptions}
            classOption="gap-2"
            value={server === '' ? null : server}
            onValueChange={(next) => void handleServerChange(next)}
          />

          {hasNoEndpoints && server !== '' && (
            <p className="text-body-small text-status-error">{t('LEARNING_DATA.NO_ENDPOINTS')}</p>
          )}

          {server === 'LOCAL' && (
            // 共通部品の FormSelect は id を描画しないため、エラー時のスクロール先をこの要素にする
            <div id="create-folder-endpoint">
              <FormSelect
                label={t('LEARNING_DATA.ENDPOINT_LABEL')}
                placeholder={t('LEARNING_DATA.ENDPOINT_PLACEHOLDER')}
                options={endpointOptions}
                value={endpointId || null}
                error={endpointError(submitted, errors.endpointId, t)}
                disabled={isLoading || hasNoEndpoints}
                onValueChange={(next) => setEndpointId(next ?? '')}
              />
            </div>
          )}

          <FormTextarea
            textareaId="create-folder-description"
            label={t('LEARNING_DATA.FOLDER_DESC_LABEL')}
            badgeText={t('COMMON.OPTIONAL')}
            placeholder={t('LEARNING_DATA.FOLDER_DESC_PLACEHOLDER')}
            rows={4}
            areaHeight={144}
            value={description}
            error={fieldError('description')}
            onValueChange={setDescription}
          />

          {server !== 'SAAS_GLOBAL' && (
            <div className="flex flex-col gap-4 md:gap-6">
              <FormInput
                id="create-folder-fetch-id"
                label={t('LEARNING_DATA.FETCH_ID_LABEL')}
                placeholder={t('LEARNING_DATA.FETCH_ID_PLACEHOLDER')}
                value={fetchId}
                error={fieldError('fetchId')}
                disabled={!server}
                dataTestid="admin-training-data-fetch-id-input"
                onValueChange={setFetchId}
              />
              <FormInput
                id="create-folder-delete-id"
                label={t('LEARNING_DATA.DELETE_ID_LABEL')}
                placeholder={t('LEARNING_DATA.DELETE_ID_PLACEHOLDER')}
                value={deleteId}
                error={fieldError('deleteId')}
                disabled={!server}
                dataTestid="admin-training-data-delete-id-input"
                onValueChange={setDeleteId}
              />
              <FormInput
                id="create-folder-learn-id"
                label={t('LEARNING_DATA.LEARN_ID_LABEL')}
                placeholder={t('LEARNING_DATA.LEARN_ID_PLACEHOLDER')}
                value={learnId}
                error={fieldError('learnId')}
                disabled={!server}
                dataTestid="admin-training-data-learn-id-input"
                onValueChange={setLearnId}
              />
            </div>
          )}
        </form>
      </div>
    </Dialog>
  );
}

/** 接続先の必須エラー。移植元は `endpointError` で、必須のときだけ `VALIDATION.REQUIRED` を出す */
function endpointError(
  submitted: boolean,
  errors: FieldErrors | null,
  t: (key: string) => string,
): string {
  return submitted && errors ? t('VALIDATION.REQUIRED') : '';
}
