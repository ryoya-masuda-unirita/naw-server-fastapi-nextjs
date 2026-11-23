import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { useUpdateTenant } from '@/hooks/use-tenant';

/** ダイアログの幅（移植元 `width: '800px', maxWidth: '90vw'`） */
const DIALOG_WIDTH = 'min(800px, 90vw)';

interface TenantRenameDialogProps {
  /** 入力中の名前。移植元の FormControl と同じく、保存せずに閉じても親が値を保つ */
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
}

/** 移植元 tenant.component・TenantRenameService の「ワークスペースの名前を変更」ダイアログ */
export function TenantRenameDialog({ value, onValueChange, onClose }: TenantRenameDialogProps) {
  const { t } = useTranslation();
  const { updateTenant, isPending } = useUpdateTenant();

  const submit = async () => {
    const name = value.trim();
    // 確認ボタンは空のあいだ無効だが、移植元と同じく送信側でも空は弾く
    if (!name) return;
    try {
      await updateTenant(name);
      onClose();
    } catch {
      // 失敗のトーストは hook が出している。ダイアログは開いたままにする（移植元と同じ）
    }
  };

  return (
    <Dialog
      open
      title={t('TENANT.RENAME_WS_TITLE')}
      confirmText={t('COMMON.SAVE')}
      cancelText={t('COMMON.CANCEL')}
      showCancel
      showConfirm
      showClose={false}
      buttonAlign="right"
      confirmDisabled={!value.trim()}
      confirmLoading={isPending}
      dialogWidth={DIALOG_WIDTH}
      onConfirm={() => void submit()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <FormInput
          label={t('TENANT.RENAME_WS_TITLE')}
          value={value}
          dataTestid="tenant-rename-input"
          onValueChange={onValueChange}
        />
      </div>
    </Dialog>
  );
}
