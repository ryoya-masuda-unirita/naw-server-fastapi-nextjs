import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormInput } from '@/components/shared/form-input';
import { isValidRoomName, normalizeRoomName } from '@/lib/utils/room-name';

interface ChatRenameDialogProps {
  /** 開いたときの入力欄の初期値（現在のルーム名）。開くたびにマウントし直す前提 */
  initialName: string;
  /** 保存。正規化（前後の空白を除いた）後の名前を渡す */
  onSave: (name: string) => void;
  onCancel: () => void;
  /** 見出し・ボタンの文言。省略するとチャット画面のヘッダーの名前変更（HEADER.RENAME・COMMON.SAVE・COMMON.CANCEL） */
  title?: string;
  cancelText?: string;
  confirmText?: string;
  /** 保存中（サイドバーのルーム名変更が使う）。保存ボタンをローディングにする */
  confirmLoading?: boolean;
}

/** 移植元 `ChatWindowComponent.openRenameDialog` と `<app-chat-rename-dialog>`。ルーム名の変更 */
export function ChatRenameDialog({
  initialName,
  onSave,
  onCancel,
  title,
  cancelText,
  confirmText,
  confirmLoading = false,
}: ChatRenameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const isRenameDisabled = !isValidRoomName(name);

  return (
    <Dialog
      open
      title={title ?? t('HEADER.RENAME')}
      showClose={false}
      showCancel
      showConfirm
      buttonAlign="right"
      cancelText={cancelText ?? t('COMMON.CANCEL')}
      confirmText={confirmText ?? t('COMMON.SAVE')}
      confirmLoading={confirmLoading}
      confirmDisabled={isRenameDisabled}
      dialogWidth="800px"
      onCancel={onCancel}
      onConfirm={() => {
        if (isRenameDisabled) return;
        onSave(normalizeRoomName(name));
      }}
      onClose={onCancel}
    >
      <FormInput
        label={t('CHAT.WINDOW.RENAME_NAME_LABEL')}
        placeholder={t('CHAT.WINDOW.RENAME_NAME_PLACEHOLDER')}
        value={name}
        onValueChange={setName}
      />
    </Dialog>
  );
}
