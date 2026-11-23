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
import { listAllGroupIds, loadEndpointsForType } from '@/hooks/use-training-data';
import { resolveControlError } from '@/lib/utils/form-errors';
import type { TrainingDataApiItem } from '@/types/training-data.types';
import { validateText } from './training-data-validation';
import { buildIndexPayload, type CreateIndexPayload } from './training-folder-form';

/** 移植元 `openEditModal` のフォームの Validators */
const NAME_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 1000;

/** 移植元 `dialog.open` の `width: '800px', maxWidth: '90vw'` */
const DIALOG_WIDTH = 'min(800px, 90vw)';

/** クラウド接続のとき、ベクトル DB と埋め込みモデルの 2 つを送る */
const SAAS_GLOBAL_ENDPOINT_COUNT = 2;

type FieldName = 'name' | 'description' | 'endpointId';

interface TrainingFolderEditDialogProps {
  data: TrainingDataApiItem;
  /** 保存。失敗したら例外を投げる（ダイアログは開いたままにする） */
  onSubmit: (payload: CreateIndexPayload) => Promise<void>;
  onClose: () => void;
}

/**
 * 移植元の「学習先フォルダの設定を編集」ダイアログ（`openEditModal` と `editFolderFormTpl`）。
 * 接続サーバーは変えられない。開くたびに入力を現在の値から始めるため、親は開いている間だけ描画する。
 */
export function TrainingFolderEditDialog({ data, onSubmit, onClose }: TrainingFolderEditDialogProps) {
  const { t } = useTranslation();
  // 連打で二重に保存しないため、state ではなく ref で見る
  const submittingRef = useRef(false);

  // 開いた時点の値で固定する。保存後の再取得で詳細が差し替わっても、入力中の接続先を巻き戻さない
  const [initialData] = useState(data);
  const server = initialData.type;
  const isLocal = server === 'LOCAL';

  const [name, setName] = useState(data.name);
  const [description, setDescription] = useState(data.description ?? '');
  const [fetchId, setFetchId] = useState(data.get ?? '');
  const [deleteId, setDeleteId] = useState(data.delete ?? '');
  const [learnId, setLearnId] = useState(data.add ?? '');
  const [endpointId, setEndpointId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 移植元 `TrainingFolderModalService` の状態。開いた直後からグループとエンドポイントを取るため、true から始める
  const [isLoading, setIsLoading] = useState(true);
  const [endpointOptions, setEndpointOptions] = useState<SelectOption[]>([]);
  const [hasNoEndpoints, setHasNoEndpoints] = useState(false);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  // 開いたときに、紐づけるグループを全部取り、続けて接続先の候補を取る（移植元 `openEditModal`）
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const ids = await listAllGroupIds();
        if (!cancelled) setGroupIds(ids);
      } catch {
        // 失敗の通知は api-client の共通エラートーストが出す。グループなしで続ける（移植元と同じ）
      }
      try {
        const state = await loadEndpointsForType(initialData.type, initialData.endpointIds);
        if (cancelled) return;
        setEndpointOptions(state.options);
        setSelectedEndpointIds(state.selectedEndpointIds);
        setHasNoEndpoints(state.hasNoEndpoints);
        if (initialData.type === 'LOCAL') setEndpointId(state.localEndpointId ?? '');
      } catch {
        // 失敗の通知は api-client の共通エラートーストが出す
      }
      if (!cancelled) setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  // クラウド接続では接続先の入力欄がないため、必須にしない（接続サーバーは編集画面で変更できない）
  const errors: Record<FieldName, ReturnType<typeof validateText>> = {
    name: validateText(name, NAME_MAX_LENGTH, true),
    description: validateText(description, DESCRIPTION_MAX_LENGTH, false),
    endpointId: validateText(endpointId, null, isLocal),
  };
  const isFormValid = Object.values(errors).every((error) => error === null);
  const isEditFolderValid = isFormValid && !hasNoEndpoints;

  const hasSelectedEndpoint =
    server === 'SAAS_GLOBAL'
      ? selectedEndpointIds.length === SAAS_GLOBAL_ENDPOINT_COUNT
      : !!endpointId;
  const canSubmit = !isLoading && !hasNoEndpoints && !isSubmitting && !!name && hasSelectedEndpoint;

  const fieldError = (field: FieldName) =>
    resolveControlError({ touched: submitted, errors: errors[field] }, t);

  const serverOptions = useMemo(
    () => [
      { label: t('LEARNING_DATA.SERVER_LOCAL'), value: 'LOCAL' as const },
      { label: t('LEARNING_DATA.SERVER_CLOUD'), value: 'SAAS_GLOBAL' as const },
    ],
    [t],
  );

  const submit = async () => {
    setSubmitted(true);
    if (!isEditFolderValid || !canSubmit || submittingRef.current) return;

    const endpointIds = server === 'SAAS_GLOBAL' ? selectedEndpointIds : [endpointId];
    const payload = buildIndexPayload(
      { name, server, description, fetchId, deleteId, learnId },
      groupIds,
      endpointIds,
    );

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。入力を残してダイアログは開いたままにする
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // 送信中に Esc・背景クリックで閉じると、保存の結果が見えないまま二重に保存しかねないため閉じない
  const handleDialogClose = () => {
    if (!submittingRef.current) onClose();
  };

  const customActions = (
    <div className="flex gap-3 justify-end max-sm:justify-center">
      <Button
        variant="outline"
        size="lg"
        className="dialog-cancel-btn flex-1"
        fullWidth
        disabled={isSubmitting}
        dataTestid="admin-training-data-edit-folder-cancel"
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
        dataTestid="admin-training-data-edit-folder-submit"
        onClick={() => void submit()}
      >
        {t('COMMON.SAVE')}
      </Button>
    </div>
  );

  return (
    <Dialog
      open
      title={t('LEARNING_DATA.MENU.EDIT_SETTINGS')}
      customActions={customActions}
      showDefaultActions={false}
      buttonAlign="right"
      dialogWidth={DIALOG_WIDTH}
      onClose={handleDialogClose}
    >
      <div className="relative">
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60"
            data-testid="admin-training-data-edit-folder-loading"
          >
            <CircularLoading />
          </div>
        )}
        <form
          className="flex flex-col gap-4 md:gap-6 text-text-strong"
          onSubmit={(event) => event.preventDefault()}
        >
          {isLocal && (
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6">
              <div className="flex gap-1 items-start md:gap-2">
                <span className="shrink-0 h-5" aria-hidden="true">
                  <SvgIcon name="lightbulb" className="icon-20 text-brand-primary" />
                </span>
                <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium">
                  {t('LEARNING_DATA.LOCAL_MODAL_INFO_TITLE')}
                </p>
              </div>
              <p className="text-body-small">{t('LEARNING_DATA.LOCAL_INFO_TEXT')}</p>
            </div>
          )}

          <FormInput
            id="edit-folder-name"
            label={t('LEARNING_DATA.FOLDER_NAME_LABEL')}
            placeholder={t('LEARNING_DATA.FOLDER_NAME_PLACEHOLDER')}
            value={name}
            error={fieldError('name')}
            dataTestid="admin-training-data-edit-folder-name"
            onValueChange={setName}
          />

          <FormRadio
            label={t('LEARNING_DATA.SERVER_LABEL')}
            layout="vertical"
            options={serverOptions}
            classOption="gap-2"
            value={server}
            disabled
          />

          {hasNoEndpoints && (
            <p className="text-body-small text-status-error">{t('LEARNING_DATA.NO_ENDPOINTS')}</p>
          )}

          {isLocal && (
            <div id="edit-folder-endpoint">
              <FormSelect
                label={t('LEARNING_DATA.ENDPOINT_LABEL')}
                placeholder={t('LEARNING_DATA.ENDPOINT_PLACEHOLDER')}
                options={endpointOptions}
                value={endpointId || null}
                error={fieldError('endpointId')}
                disabled={isLoading || hasNoEndpoints}
                onValueChange={(next) => setEndpointId(next ?? '')}
              />
            </div>
          )}

          <FormTextarea
            textareaId="edit-folder-description"
            label={t('LEARNING_DATA.FOLDER_DESC_LABEL')}
            badgeText={t('COMMON.OPTIONAL')}
            placeholder={t('LEARNING_DATA.FOLDER_DESC_PLACEHOLDER')}
            rows={4}
            areaHeight={144}
            value={description}
            error={fieldError('description')}
            onValueChange={setDescription}
          />

          {isLocal && (
            <div className="flex flex-col gap-4 md:gap-6">
              <FormInput
                id="edit-folder-fetch-id"
                label={t('LEARNING_DATA.EDIT_FETCH_ID_LABEL')}
                badgeText={t('COMMON.OPTIONAL')}
                placeholder={t('LEARNING_DATA.EDIT_FETCH_ID_PLACEHOLDER')}
                value={fetchId}
                dataTestid="admin-training-data-edit-folder-fetch-id"
                onValueChange={setFetchId}
              />
              <FormInput
                id="edit-folder-delete-id"
                label={t('LEARNING_DATA.EDIT_DELETE_ID_LABEL')}
                badgeText={t('COMMON.OPTIONAL')}
                placeholder={t('LEARNING_DATA.EDIT_DELETE_ID_PLACEHOLDER')}
                value={deleteId}
                dataTestid="admin-training-data-edit-folder-delete-id"
                onValueChange={setDeleteId}
              />
              <FormInput
                id="edit-folder-learn-id"
                label={t('LEARNING_DATA.EDIT_LEARN_ID_LABEL')}
                badgeText={t('COMMON.OPTIONAL')}
                placeholder={t('LEARNING_DATA.EDIT_LEARN_ID_PLACEHOLDER')}
                value={learnId}
                dataTestid="admin-training-data-edit-folder-learn-id"
                onValueChange={setLearnId}
              />
            </div>
          )}
        </form>
      </div>
    </Dialog>
  );
}
