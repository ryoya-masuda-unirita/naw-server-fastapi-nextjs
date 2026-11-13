import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormTextarea } from '@/components/shared/form-textarea';
import { useToastStore } from '@/components/shared/toast-store';
import { useCreateAssistantCategory, useUpdateAssistantCategory } from '@/hooks/use-assistant-list';
import { resolveControlError, type FieldErrors } from '@/lib/utils/form-errors';
import type { AssistantCategoryApiItem } from '@/types/admin/assistant.types';

/** 移植元 category-tab.component の `addForm`・`editForm` の Validators.maxLength */
const NAME_MAX_LENGTH = 16;
const DESCRIPTION_MAX_LENGTH = 255;

/** ダイアログの幅・確定ボタンの最小幅（移植元の `width: '800px'`・`confirmMinWidth`） */
const DIALOG_WIDTH = '800px';
const CONFIRM_MIN_WIDTH = 'min-w-[98.5px]';

type FieldName = 'name' | 'description';

/** Angular の Validators.required・maxLength と同じ判定（required は空文字だけを弾く） */
function validateField(value: string, maxLength: number, required: boolean): FieldErrors | null {
  if (required && value.length === 0) return { required: true };
  if (value.length > maxLength) {
    return { maxlength: { requiredLength: maxLength, actualLength: value.length } };
  }
  return null;
}

interface CategoryFormDialogProps {
  /** 編集するカテゴリ。なければ新規作成 */
  category?: AssistantCategoryApiItem;
  onClose: () => void;
}

/**
 * 移植元の追加・編集ダイアログ（`<app-category-add-dialog>`・`<app-category-edit-dialog>` を入れた DialogComponent。
 * 2 つのテンプレートは同一）。開くたびに作り直す前提で、親は開いている間だけ描画する。
 */
export function CategoryFormDialog({ category, onClose }: CategoryFormDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createMutation = useCreateAssistantCategory();
  const updateMutation = useUpdateAssistantCategory();
  const isEdit = category !== undefined;

  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    description: false,
  });

  const errors: Record<FieldName, FieldErrors | null> = {
    name: validateField(name, NAME_MAX_LENGTH, true),
    description: validateField(description, DESCRIPTION_MAX_LENGTH, false),
  };
  const invalid = Object.values(errors).some((error) => error !== null);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const touch = (field: FieldName) => setTouched((prev) => ({ ...prev, [field]: true }));
  const fieldError = (field: FieldName) =>
    resolveControlError({ touched: touched[field], errors: errors[field] }, t);

  const submit = async () => {
    if (isSubmitting) return;
    setTouched({ name: true, description: true });
    if (invalid) return;

    const payload = { name: name.trim(), description: description.trim() };
    try {
      if (category) {
        await updateMutation.mutateAsync({ id: category.id, payload });
        toast.success(t('ADMIN.ASSISTANT.UPDATE_CATEGORY_SUCCESS'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('ADMIN.ASSISTANT.CREATE_CATEGORY_SUCCESS'));
      }
      onClose();
    } catch (error) {
      console.error(error);
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(
        t(isEdit ? 'ADMIN.ASSISTANT.UPDATE_CATEGORY_FAILED' : 'ADMIN.ASSISTANT.CREATE_CATEGORY_FAILED'),
      );
    }
  };

  return (
    <Dialog
      open
      title={t(isEdit ? 'ADMIN.ASSISTANT.EDIT_CATEGORY' : 'ADMIN.ASSISTANT.CREATE_CATEGORY')}
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
      <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
        <FormInput
          label={t('ADMIN.ASSISTANT.CATEGORY_NAME_LABEL')}
          placeholder={t('ADMIN.ASSISTANT.CATEGORY_NAME_PLACEHOLDER')}
          value={name}
          error={fieldError('name')}
          autocomplete="off"
          onValueChange={setName}
          onFormBlur={() => touch('name')}
        />

        <FormTextarea
          label={t('ADMIN.ASSISTANT.CATEGORY_DESCRIPTION_LABEL')}
          badgeText={t('COMMON.OPTIONAL')}
          placeholder={t('ADMIN.ASSISTANT.CATEGORY_DESCRIPTION_PLACEHOLDER')}
          value={description}
          error={fieldError('description')}
          rows={5}
          onValueChange={setDescription}
          onFormBlur={() => touch('description')}
        />
      </form>
    </Dialog>
  );
}
