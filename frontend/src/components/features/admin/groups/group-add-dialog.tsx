import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { useToastStore } from '@/components/shared/toast-store';
import { useCreateGroup } from '@/hooks/use-group-list';
import { resolveControlError } from '@/lib/utils/form-errors';
import { GROUP_NAME_DIALOG_WIDTH, validateGroupName } from './group-name-validation';

interface GroupAddDialogProps {
  onClose: () => void;
}

/**
 * 移植元の「チームを新規作成」ダイアログ（`<app-group-form>` を入れた DialogComponent）。
 * 開くたびに作り直す前提で、親は開いている間だけ描画する（移植元の `addForm.reset` に相当）。
 */
export function GroupAddDialog({ onClose }: GroupAddDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const createMutation = useCreateGroup();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const errors = validateGroupName(name);
  const nameError = resolveControlError({ touched, errors }, t);

  const submit = async () => {
    if (createMutation.isPending) return;
    setTouched(true);
    if (errors) return;

    try {
      await createMutation.mutateAsync({ name: name.trim() });
      toast.success(t('GROUPS.CREATE_SUCCESS'));
      onClose();
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t('GROUPS.CREATE_FAILED'));
    }
  };

  return (
    <Dialog
      open
      title={t('GROUPS.ADD_TEAM_TITLE')}
      confirmText={t('COMMON.CREATE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      buttonAlign="right"
      confirmLoading={createMutation.isPending}
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
