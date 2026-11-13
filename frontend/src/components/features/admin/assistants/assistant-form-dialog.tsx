import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { ComboboxMulti } from '@/components/shared/combobox-multi';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormRadio } from '@/components/shared/form-radio';
import { FormSelect } from '@/components/shared/form-select';
import { FormSwitch } from '@/components/shared/form-switch';
import { FormTextarea } from '@/components/shared/form-textarea';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption } from '@/components/shared/types';
import {
  useCreateAssistant,
  useUpdateAssistant,
  type AssistantOptions,
} from '@/hooks/use-assistant-list';
import { resolveControlError, type FieldErrors } from '@/lib/utils/form-errors';
import type { AssistantApiItem, AssistantMutationPayload } from '@/types/admin/assistant.types';
import {
  ASSISTANT_SERVER_OPTIONS,
  ASSISTANT_SERVER_TYPE,
  NONE_OPTION_VALUE,
} from './assistant-list.constants';

/** 移植元 assistant-tab.component の `addForm`・`editForm` の Validators */
const NAME_MAX_LENGTH = 32;
const DESCRIPTION_MAX_LENGTH = 1000;

/** ダイアログの幅・確定ボタンの最小幅（移植元の `width: '800px'`・`confirmMinWidth`） */
const DIALOG_WIDTH = '800px';
const CONFIRM_MIN_WIDTH = 'min-w-24.5';

/** 「コピーしました」の表示を戻すまでの時間（移植元 `copyAssistantId`） */
const COPIED_RESET_MS = 1000;
/** 入力に誤りがあるとき、描画を待ってからスクロールする時間（移植元 `focusFirstInvalidControl`） */
const FOCUS_DELAY_MS = 100;

interface AssistantFormValues {
  name: string;
  description: string;
  serverType: string;
  serverApi: string;
  categories: string[];
  model: string;
  includeHistory: boolean;
  iconColor: string;
  groups: string[];
  folder: string;
}

type FieldName = keyof AssistantFormValues;

/** 画面に並ぶ順（誤りのある最初の項目へスクロールするため） */
const FIELD_ORDER: FieldName[] = [
  'name',
  'serverType',
  'serverApi',
  'model',
  'folder',
  'categories',
  'groups',
  'description',
  'includeHistory',
];

const EMPTY_VALUES: AssistantFormValues = {
  name: '',
  description: '',
  serverType: '',
  serverApi: '',
  categories: [],
  model: '',
  includeHistory: false,
  iconColor: '',
  groups: [],
  folder: '',
};

type Touched = Partial<Record<FieldName, boolean>>;

/** Angular の Validators.required・maxLength と同じ判定（required は空文字だけを弾く） */
function validateField(value: string, maxLength: number | null, required: boolean): FieldErrors | null {
  if (required && value.length === 0) return { required: true };
  if (maxLength !== null && value.length > maxLength) {
    return { maxlength: { requiredLength: maxLength, actualLength: value.length } };
  }
  return null;
}

function validate(values: AssistantFormValues): Partial<Record<FieldName, FieldErrors | null>> {
  return {
    name: validateField(values.name, NAME_MAX_LENGTH, true),
    description: validateField(values.description, DESCRIPTION_MAX_LENGTH, false),
    serverType: validateField(values.serverType, null, true),
    serverApi: validateField(values.serverApi, null, true),
    model: validateField(values.model, null, true),
  };
}

/** 移植元 `checkFolderWithServerCloud`。学習先指定のクラウドでは学習先フォルダが必須 */
function isFolderRequired(values: AssistantFormValues): boolean {
  return (
    values.serverType === ASSISTANT_SERVER_TYPE.SAAS_RAG && values.folder.trim() === ''
  );
}

/** 移植元 `mapFormToApi` */
function toPayload(values: AssistantFormValues): AssistantMutationPayload {
  const isRag = values.serverType === ASSISTANT_SERVER_TYPE.SAAS_RAG;
  return {
    type: values.serverType,
    name: values.name,
    description: values.description,
    includeHistory: values.includeHistory,
    iconColor: values.iconColor,
    groups: values.groups.filter((groupId) => groupId !== NONE_OPTION_VALUE),
    categoryIds: values.categories.filter((categoryId) => categoryId !== NONE_OPTION_VALUE),
    indexId: isRag ? values.folder || null : '',
    endpoints: [{ id: values.serverApi, model: values.model, url: '' }],
  };
}

/** 移植元 `getEditableEndpoint`。編集で見せる接続先を決める */
function getEditableEndpoint(assistant: AssistantApiItem): AssistantApiItem['endpoints'][number] | undefined {
  if (assistant.type === ASSISTANT_SERVER_TYPE.SECURE) {
    return (
      assistant.endpoints.find((endpoint) => endpoint.type === 'LOCAL_SERVER') ??
      assistant.endpoints[0]
    );
  }
  return (
    assistant.endpoints.find((endpoint) => String(endpoint.type).includes('CHAT')) ??
    assistant.endpoints[0]
  );
}

/** 移植元 `onEditAssistant` のフォームの初期値 */
function toEditValues(assistant: AssistantApiItem, options: AssistantOptions): AssistantFormValues {
  const endpoint = getEditableEndpoint(assistant);
  const isAvailable =
    !!endpoint?.id &&
    options.serverApiOptions[assistant.type]?.some((option) => option.value === endpoint.id) === true;
  const serverApi = isAvailable ? (endpoint?.id ?? '') : '';
  const categoryIds =
    assistant.categories?.map((category) => category.id) ??
    (assistant.category?.id ? [assistant.category.id] : []);
  return {
    name: assistant.name,
    description: assistant.description ?? '',
    serverType: assistant.type,
    serverApi,
    categories: categoryIds,
    model: serverApi ? endpoint?.model || '' : '',
    includeHistory: assistant.includeHistory,
    iconColor: assistant.iconColor ?? '',
    groups: assistant.groups ?? [],
    folder: assistant.type === ASSISTANT_SERVER_TYPE.SAAS_RAG ? (assistant.indexId ?? '') : '',
  };
}

interface AssistantFormDialogProps {
  /** 編集するアシスタント。なければ新規作成 */
  assistant?: AssistantApiItem;
  options: AssistantOptions;
  onClose: () => void;
}

/**
 * 移植元の追加・編集ダイアログ（`<app-assistant-add-dialog>`・`<app-assistant-edit-dialog>` を入れた DialogComponent）。
 * 2 つは編集時の ID 欄・モデル欄の出し分け・学習先フォルダの出し分けが違うだけなので 1 つにまとめた。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する（移植元の `form.reset` に相当）。
 */
export function AssistantFormDialog({ assistant, options, onClose }: AssistantFormDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createMutation = useCreateAssistant();
  const updateMutation = useUpdateAssistant();
  const isEdit = assistant !== undefined;

  const [values, setValues] = useState<AssistantFormValues>(() =>
    assistant ? toEditValues(assistant, options) : EMPTY_VALUES,
  );
  const [touched, setTouched] = useState<Touched>({});
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 追加ダイアログで接続サーバー未選択のときに出る、値を持たない入力欄の文字（移植元は値を結び付けていない）
  const [placeholderModel, setPlaceholderModel] = useState('');

  // ダイアログを閉じたあとに状態を更新しないよう、コピー表示のタイマーを止める
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  const errors = validate(values);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const { serverType, serverApi } = values;

  const categoriesOptions = useMemo(
    () => options.categoriesOptions.filter((option) => option.value !== NONE_OPTION_VALUE),
    [options.categoriesOptions],
  );
  const groupsOptions = useMemo(
    () => options.groupOptions.filter((option) => option.value !== NONE_OPTION_VALUE),
    [options.groupOptions],
  );

  const touch = (field: FieldName) => setTouched((prev) => ({ ...prev, [field]: true }));
  const untouch = (...fields: FieldName[]) =>
    setTouched((prev) => {
      const next = { ...prev };
      fields.forEach((field) => delete next[field]);
      return next;
    });

  const fieldError = (field: 'name' | 'description' | 'serverType' | 'serverApi' | 'model') =>
    resolveControlError({ touched: touched[field] === true, errors: errors[field] ?? null }, t);

  // 移植元 `folderError`。学習先フォルダか接続サーバーを触っていれば必須エラーを出す
  const folderError =
    (touched.folder === true || touched.serverType === true) && isFolderRequired(values)
      ? t('VALIDATION.REQUIRED')
      : '';

  /** 移植元 `setControlValue`。接続サーバー・接続先を変えると、その下の項目を空に戻す（触っていない状態に戻る） */
  const setField = <K extends FieldName>(field: K, value: AssistantFormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'serverType') {
        next.serverApi = '';
        next.model = '';
        next.folder = '';
      } else if (field === 'serverApi') {
        next.model = '';
      }
      return next;
    });
    if (field === 'serverType') untouch('serverApi', 'model', 'folder');
    else if (field === 'serverApi') untouch('model');
  };

  const copyAssistantId = async () => {
    if (!assistant) return;
    try {
      await navigator.clipboard.writeText(assistant.id);
    } catch (error) {
      console.error('Failed to copy assistant id', error);
      return;
    }
    setIsCopied(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
  };

  const focusFirstInvalid = () => {
    const invalid = FIELD_ORDER.find((field) => {
      if (field === 'folder') return isFolderRequired(values);
      return errors[field] != null;
    });
    if (!invalid) return;
    setTimeout(() => {
      const wrapper = document.getElementById(`assistant-form-${invalid}`);
      if (!wrapper) return;
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      wrapper.querySelector<HTMLElement>('input, textarea, button')?.focus();
    }, FOCUS_DELAY_MS);
  };

  const submit = async () => {
    if (isSubmitting) return;
    setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));
    const invalid = Object.values(errors).some((error) => error != null) || isFolderRequired(values);
    if (invalid) {
      focusFirstInvalid();
      return;
    }

    const payload = toPayload(values);
    try {
      if (assistant) {
        await updateMutation.mutateAsync({ id: assistant.id, payload });
        toast.success(t('ADMIN.ASSISTANT.UPDATE_ASSISTANT_SUCCESS'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('ADMIN.ASSISTANT.CREATE_ASSISTANT_SUCCESS'));
      }
      onClose();
    } catch (error) {
      console.error(error);
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(
        t(isEdit ? 'ADMIN.ASSISTANT.UPDATE_ASSISTANT_FAILED' : 'ADMIN.ASSISTANT.CREATE_ASSISTANT_FAILED'),
      );
    }
  };

  const serverTypeOptions: SelectOption[] = ASSISTANT_SERVER_OPTIONS;
  const apiOptions = serverType !== '' ? (options.serverApiOptions[serverType] ?? []) : [];
  const modelOptions =
    serverType !== '' && serverApi !== ''
      ? (options.modelOptions[serverType]?.[serverApi] ?? [])
      : [];
  const isLocalServer = serverType === ASSISTANT_SERVER_TYPE.SECURE;
  // 追加ダイアログだけ、接続サーバー未選択のときは学習先フォルダも出す
  const showFolder = serverType === ASSISTANT_SERVER_TYPE.SAAS_RAG || (!isEdit && serverType === '');
  const modelDisabled = serverType === '' || serverApi === '';

  return (
    <Dialog
      open
      title={t(isEdit ? 'ADMIN.ASSISTANT.EDIT_ASSISTANT' : 'ADMIN.ASSISTANT.CREATE_ASSISTANT')}
      confirmText={t(isEdit ? 'COMMON.SAVE' : 'COMMON.CREATE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmMinWidth={CONFIRM_MIN_WIDTH}
      confirmLoading={isSubmitting}
      dialogWidth={DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <form className="flex flex-col gap-4 md:gap-6" onSubmit={(event) => event.preventDefault()}>
        {(isLocalServer || serverType === '') && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl bg-bg-secondary md:gap-2 md:p-6 md:text-label-x-large"
            data-assistant-info-block=""
          >
            <div className="flex gap-1 items-start md:gap-2">
              <SvgIcon name="light" className="w-5 h-5 text-primary" />
              <p className="flex-1 min-w-0 text-label-large md:text-label-x-large font-medium">
                {t('ADMIN.ASSISTANT.NOTE_LOCAL_TEXT_1')}
              </p>
            </div>
            <p className="text-body-small">{t('ADMIN.ASSISTANT.NOTE_LOCAL_TEXT_2')}</p>
          </div>
        )}

        {assistant && (
          <FormInput
            label={t('ADMIN.ASSISTANT.ASSISTANT_ID')}
            value={assistant.id}
            autocomplete="off"
            placeholder={t('ADMIN.ASSISTANT.ASSISTANT_ID_PLACEHOLDER')}
            disabled
            endAdornment={
              <Button
                variant="outline"
                size="lg"
                className="flex items-end text-btn-large w-34.5"
                onClick={() => void copyAssistantId()}
              >
                <SvgIcon name={isCopied ? 'active' : 'copy'} className="w-5 h-5 text-primary" />
                {t('ADMIN.ASSISTANT.COPY')}
              </Button>
            }
          />
        )}

        <div id="assistant-form-name">
          <FormInput
            label={t('ADMIN.ASSISTANT.DISPLAY_NAME')}
            placeholder={t('ADMIN.ASSISTANT.DISPLAY_NAME_PLACEHOLDER')}
            value={values.name}
            error={fieldError('name')}
            autocomplete="off"
            onValueChange={(value) => setField('name', value)}
            onFormBlur={() => touch('name')}
          />
        </div>

        <div id="assistant-form-serverType">
          <FormRadio
            label={t('ADMIN.ASSISTANT.CONNECT_SERVER')}
            options={serverTypeOptions}
            value={serverType}
            error={fieldError('serverType')}
            layout="vertical"
            classOption={isEdit ? 'flex-col gap-3' : 'flex-col gap-2'}
            onValueChange={(value) => setField('serverType', value ?? '')}
            onFormBlur={() => touch('serverType')}
          />
        </div>

        <div id="assistant-form-serverApi">
          <FormSelect
            label={t('ADMIN.ASSISTANT.CONNECT_API')}
            placeholder={t('ADMIN.ASSISTANT.PLACEHOLDER_CONNECT_API')}
            options={apiOptions}
            value={serverApi || null}
            error={fieldError('serverApi')}
            disabled={serverType === ''}
            size="default"
            className="w-full"
            classNameInputSelect="pl-4 pr-5"
            onValueChange={(value) => setField('serverApi', value ?? '')}
            onFormBlur={() => touch('serverApi')}
          />
        </div>

        <div id="assistant-form-model" className="flex flex-col gap-4 md:gap-6">
          {!isEdit && serverType === '' ? (
            <>
              <FormInput
                label={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_LOCAL')}
                placeholder={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_LOCAL_PLACEHOLDER')}
                value={placeholderModel}
                error={fieldError('model')}
                autocomplete="off"
                onValueChange={setPlaceholderModel}
              />
              <FormSelect
                label={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL')}
                placeholder={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_NOT_LOCAL_PLACEHOLDER')}
                options={[]}
                error={fieldError('model')}
                disabled
                size="default"
                className="w-full"
                classNameInputSelect="pl-4 pr-5"
              />
            </>
          ) : isLocalServer || serverType === '' ? (
            <FormInput
              label={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_LOCAL')}
              supportText={t('ADMIN.ASSISTANT.SUPPORT_LOCAL_TEXT')}
              placeholder={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL_LOCAL_PLACEHOLDER')}
              value={values.model}
              error={fieldError('model')}
              disabled={serverType === ''}
              autocomplete="off"
              onValueChange={(value) => setField('model', value)}
              onFormBlur={() => touch('model')}
            />
          ) : (
            <FormSelect
              label={t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL')}
              placeholder={t('ADMIN.ASSISTANT.SELECT_MODEL')}
              options={modelOptions}
              value={values.model || null}
              error={fieldError('model')}
              disabled={modelDisabled}
              size="default"
              className="w-full"
              classNameInputSelect="pl-4 pr-5"
              onValueChange={(value) => setField('model', value ?? '')}
              onFormBlur={() => touch('model')}
            />
          )}
        </div>

        {showFolder && (
          <div id="assistant-form-folder">
            <FormSelect
              label={t('ADMIN.ASSISTANT.LEARNING_FOLDER')}
              placeholder={t('ADMIN.ASSISTANT.SELECT_FOLDER')}
              options={options.folderOptions}
              value={values.folder || null}
              error={folderError}
              disabled={serverApi === ''}
              size="default"
              className="w-full"
              classNameInputSelect="pl-4 pr-5"
              onValueChange={(value) => setField('folder', value ?? '')}
              onFormBlur={() => touch('folder')}
            />
          </div>
        )}

        <div id="assistant-form-categories">
          <ComboboxMulti
            id="categories"
            name="categories"
            label={t('ADMIN.ASSISTANT.CATEGORY')}
            placeholder={t('ADMIN.ASSISTANT.SELECT_CATEGORY')}
            options={categoriesOptions}
            value={values.categories}
            searchHint={t('ADMIN.ASSISTANT.CATEGORIES_SEARCH_HINT')}
            panelSize="full"
            onValueChange={(value) => setField('categories', value)}
          />
        </div>

        <div id="assistant-form-groups">
          <ComboboxMulti
            id="groups"
            name="groups"
            label={t('ADMIN.ASSISTANT.BELONGING_TEAM')}
            badgeText={t('COMMON.OPTIONAL')}
            placeholder={t('ADMIN.ASSISTANT.SELECT_TEAM')}
            options={groupsOptions}
            value={values.groups}
            searchHint={t('ADMIN.ASSISTANT.TEAMS_SEARCH_HINT')}
            panelSize="full"
            onValueChange={(value) => setField('groups', value)}
          />
        </div>

        <div id="assistant-form-description">
          <FormTextarea
            label={t('ADMIN.ASSISTANT.ASSISTANT_DESCRIPTION')}
            badgeText={t('COMMON.OPTIONAL')}
            supportText={isEdit ? t('ADMIN.ASSISTANT.SUPPORT_TEXT') : undefined}
            placeholder={t('ADMIN.ASSISTANT.ASSISTANT_DESCRIPTION_PLACEHOLDER')}
            value={values.description}
            error={fieldError('description')}
            rows={5}
            onValueChange={(value) => setField('description', value)}
            onFormBlur={() => touch('description')}
          />
        </div>

        <div id="assistant-form-includeHistory">
          <FormSwitch
            label={t('ADMIN.ASSISTANT.HISTORY_SEND')}
            checked={values.includeHistory}
            size="lg"
            onCheckedChange={(checked) => setField('includeHistory', checked)}
            onFormBlur={() => touch('includeHistory')}
          />
        </div>
      </form>
    </Dialog>
  );
}
