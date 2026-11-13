import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComboboxMulti } from '@/components/shared/combobox-multi';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormTextarea } from '@/components/shared/form-textarea';
import type { SelectOption } from '@/components/shared/types';
import { useToastStore } from '@/components/shared/toast-store';
import {
  useCreateTemplate,
  useUpdateTemplate,
  type GroupOption,
} from '@/hooks/use-template-list';
import { resolveControlError, type FieldErrors } from '@/lib/utils/form-errors';
import type { AdminTemplate } from '@/types/admin/template.types';

/** 移植元 template-list.component の `buildTemplateForm` の Validators.maxLength */
const NAME_MAX_LENGTH = 100;
const SYSTEM_PROMPT_MAX_LENGTH = 4000;
const DESCRIPTION_MAX_LENGTH = 500;

/** ダイアログの幅（移植元 `width: '100%', maxWidth: '800px'`） */
const DIALOG_WIDTH = 'min(100%, 800px)';
const CONFIRM_MIN_WIDTH = 'min-w-[98px]';

type FieldName = 'name' | 'systemPrompt' | 'description';

/**
 * Angular の Validators.required・maxLength と同じ判定。
 * required は空文字だけを弾く（空白だけの値は通す。送信時の trim で空になる点も移植元どおり）。
 */
function validateField(value: string, maxLength: number, required: boolean): FieldErrors | null {
  if (required && value.length === 0) return { required: true };
  if (value.length > maxLength) {
    return { maxlength: { requiredLength: maxLength, actualLength: value.length } };
  }
  return null;
}

interface TemplateFormDialogProps {
  /** 編集するテンプレート。なければ新規作成 */
  template?: AdminTemplate;
  groupOptions: GroupOption[];
  onClose: () => void;
}

/**
 * 移植元の追加・編集ダイアログ（`<app-template-form>` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する（移植元の `form.reset` に相当）。
 */
export function TemplateFormDialog({ template, groupOptions, onClose }: TemplateFormDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const isEdit = template !== undefined;

  // 一覧のチーム名をグループ ID に戻す（名前に一致するものがなければそのまま）。重複は除く
  const [initialGroupIds] = useState(() => {
    if (!template) return [];
    const nameToId = new Map(groupOptions.map((option) => [option.name, option.id]));
    const ids = template.teams.map((team) => nameToId.get(team) ?? team);
    return ids.filter((groupId, index, list) => list.indexOf(groupId) === index);
  });
  const [previousGroupIds, setPreviousGroupIds] = useState(initialGroupIds);

  const [name, setName] = useState(template?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [groupIds, setGroupIds] = useState<string[]>(initialGroupIds);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    systemPrompt: false,
    description: false,
  });

  const errors: Record<FieldName, FieldErrors | null> = {
    name: validateField(name, NAME_MAX_LENGTH, true),
    systemPrompt: validateField(systemPrompt, SYSTEM_PROMPT_MAX_LENGTH, true),
    description: validateField(description, DESCRIPTION_MAX_LENGTH, false),
  };
  const invalid = Object.values(errors).some((error) => error !== null);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const teamOptions = useMemo<SelectOption[]>(
    () => groupOptions.map((group) => ({ value: group.id, label: group.name })),
    [groupOptions],
  );

  const touch = (field: FieldName) => setTouched((prev) => ({ ...prev, [field]: true }));
  const fieldError = (field: FieldName) =>
    resolveControlError({ touched: touched[field], errors: errors[field] }, t);

  const submit = async () => {
    if (isSubmitting) return;
    setTouched({ name: true, systemPrompt: true, description: true });
    if (invalid) return;

    const payload = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      description: description.trim(),
    };
    const selectedGroupIds = [...new Set(groupIds)];
    try {
      if (template) {
        await updateMutation.mutateAsync({
          id: template.id,
          payload,
          previousGroupIds,
          nextGroupIds: selectedGroupIds,
        });
        setPreviousGroupIds(selectedGroupIds);
        toast.success(t('TEMPLATES.UPDATE_SUCCESS'));
      } else {
        await createMutation.mutateAsync({ payload, groupIds: selectedGroupIds });
        toast.success(t('TEMPLATES.CREATE_SUCCESS'));
      }
      onClose();
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t(isEdit ? 'TEMPLATES.UPDATE_FAILED' : 'TEMPLATES.CREATE_FAILED'));
    }
  };

  return (
    <Dialog
      open
      title={t(isEdit ? 'TEMPLATES.EDIT_TEMPLATE_TITLE' : 'TEMPLATES.ADD_TEMPLATE_TITLE')}
      confirmText={t(isEdit ? 'COMMON.SAVE' : 'COMMON.CREATE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmMinWidth={CONFIRM_MIN_WIDTH}
      confirmDisabled={invalid}
      confirmLoading={isSubmitting}
      dialogWidth={DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4 md:gap-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <FormInput
          label={t('TEMPLATES.NAME_LABEL')}
          placeholder={t('TEMPLATES.NAME_PLACEHOLDER')}
          value={name}
          error={fieldError('name')}
          onValueChange={setName}
          onFormBlur={() => touch('name')}
        />

        <FormTextarea
          label={t('TEMPLATES.SYSTEM_PROMPT')}
          placeholder={t('TEMPLATES.SYSTEM_PROMPT_PLACEHOLDER')}
          value={systemPrompt}
          error={fieldError('systemPrompt')}
          onValueChange={setSystemPrompt}
          onFormBlur={() => touch('systemPrompt')}
        />

        <FormTextarea
          label={t('TEMPLATES.DESCRIPTION')}
          badgeText={t('COMMON.OPTIONAL')}
          placeholder={t('TEMPLATES.DESCRIPTION_PLACEHOLDER')}
          value={description}
          error={fieldError('description')}
          onValueChange={setDescription}
          onFormBlur={() => touch('description')}
        />

        <div className="flex flex-col">
          <div className="fieldset-head mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-text-default leading-[1.4]">
                {t('TEMPLATES.TEAMS')}
              </span>
              <span className="bg-bg-secondary text-text-muted text-[10px] px-1 py-0.5 rounded leading-none">
                {t('COMMON.OPTIONAL')}
              </span>
            </div>
          </div>
          <ComboboxMulti
            id="groups-multi-select"
            name="groups-multi-select"
            options={teamOptions}
            value={groupIds}
            onValueChange={setGroupIds}
            placeholder={t('TEMPLATES.TEAMS_PLACEHOLDER')}
            searchHint={t('TEMPLATES.TEAMS_SEARCH_HINT')}
            panelSize="full"
          />
        </div>
      </form>
    </Dialog>
  );
}
