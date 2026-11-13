import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { useToastStore } from '@/components/shared/toast-store';
import { useUpdateGroup } from '@/hooks/use-group-detail';
import { resolveControlError } from '@/lib/utils/form-errors';
import { GROUP_NAME_DIALOG_WIDTH, validateGroupName } from './group-name-validation';

interface GroupEditDialogProps {
  groupId: string;
  /** 開いた時点のチーム名（移植元の `editForm.reset({ name: groupName() })`） */
  initialName: string;
  onClose: () => void;
}

/**
 * 移植元の「チームの設定を編集」ダイアログ（`<app-group-form>` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する。
 */
export function GroupEditDialog({ groupId, initialName, onClose }: GroupEditDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const updateMutation = useUpdateGroup(groupId);
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);

  const errors = validateGroupName(name);
  const nameError = resolveControlError({ touched, errors }, t);

  const submit = async () => {
    if (updateMutation.isPending) return;
    setTouched(true);
    if (errors) return;

    try {
      await updateMutation.mutateAsync({ name: name.trim() });
      toast.success(t('GROUPS.UPDATE_SUCCESS'));
      onClose();
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t('GROUPS.UPDATE_FAILED'));
    }
  };

  return (
    <Dialog
      open
      title={t('GROUPS.EDIT_TEAM_TITLE')}
      confirmText={t('COMMON.SAVE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmLoading={updateMutation.isPending}
      dialogWidth={GROUP_NAME_DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <form className="flex flex-col gap-4 md:gap-6" onSubmit={(event) => event.preventDefault()}>
        <FormInput
          label={t('GROUPS.NAME_LABEL')}
          placeholder={t('GROUPS.NAME_PLACEHOLDER')}
          value={name}
          error={nameError}
          dataTestid="admin-groups-name-input"
          onValueChange={setName}
          onFormBlur={() => setTouched(true)}
        />
      </form>
    </Dialog>
  );
}
