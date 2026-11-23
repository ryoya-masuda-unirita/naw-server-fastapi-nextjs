import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { FormTextarea } from '@/components/shared/form-textarea';
import { useToastStore } from '@/components/shared/toast-store';
import { useCreateTag, useUpdateTag } from '@/hooks/use-library-tags';
import { useLibraryTagsStore } from '@/store/library-tags-store';
import type { TagItem } from '@/types/admin/library.types';

/** 移植元 `TAG_NAME_MAX_LENGTH` */
export const TAG_NAME_MAX_LENGTH = 255;
const DIALOG_WIDTH = '800px';
const DESCRIPTION_AREA_HEIGHT = 144;

interface TagEditSettingsDialogProps {
  /** 編集するタグ。なければ新規作成 */
  tag?: TagItem;
  onClose: () => void;
}

/**
 * 移植元のタグの追加・編集ダイアログ（`TagEditSettingsDialogComponent` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する。
 */
export function TagEditSettingsDialog({ tag, onClose }: TagEditSettingsDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createMutation = useCreateTag();
  const updateMutation = useUpdateTag();
  const goFirstPage = useLibraryTagsStore((state) => state.goFirstPage);
  const isCreate = tag === undefined;

  const [name, setName] = useState(tag?.name ?? '');
  // backend は説明が null で返る（移植元の型は undefined のみ）ので空文字に寄せる
  const [description, setDescription] = useState(tag?.description ?? '');

  const nameError =
    name.length > TAG_NAME_MAX_LENGTH
      ? t('VALIDATION.MAX_LENGTH', { max: TAG_NAME_MAX_LENGTH })
      : '';
  const isValid = name.trim().length > 0 && name.length <= TAG_NAME_MAX_LENGTH;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const save = async () => {
    if (!isValid || isSubmitting) return;
    const payload = { name, description: description || undefined };
    try {
      if (tag) {
        await updateMutation.mutateAsync({ id: tag.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
        goFirstPage();
      }
      onClose();
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(
        t(isCreate ? 'ADMIN.LIBRARY.TAGS.CREATE_FAILED' : 'ADMIN.LIBRARY.TAGS.UPDATE_FAILED'),
      );
    }
  };

  return (
    <Dialog
      open
      title={t(isCreate ? 'ADMIN.LIBRARY.TAGS.ADD' : 'ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TITLE')}
      showDefaultActions={false}
      buttonAlign="right"
      dialogWidth={DIALOG_WIDTH}
      customActions={
        <div className="flex gap-3 justify-end max-[576px]:justify-center">
          <Button
            variant="outline"
            size="lg"
            className="dialog-cancel-btn flex-1"
            fullWidth
            onClick={onClose}
          >
            {t('COMMON.CANCEL')}
          </Button>
          <Button
            variant="solid"
            size="lg"
            className="flex-1"
            fullWidth
            disabled={!isValid}
            onClick={() => void save()}
          >
            {t(isCreate ? 'COMMON.CREATE' : 'COMMON.SAVE')}
          </Button>
        </div>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        <FormInput
          label={t('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.NAME_LABEL')}
          value={name}
          placeholder={t('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TAG_NAME_PLACEHOLDER')}
          maxLength={TAG_NAME_MAX_LENGTH}
          error={nameError}
          onValueChange={setName}
        />

        <FormTextarea
          label={t('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.DESC_LABEL')}
          badgeText={t('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.OPTIONAL')}
          value={description}
          placeholder={t('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TAG_DESC_PLACEHOLDER')}
          areaHeight={DESCRIPTION_AREA_HEIGHT}
          onValueChange={setDescription}
        />
      </div>
    </Dialog>
  );
}
