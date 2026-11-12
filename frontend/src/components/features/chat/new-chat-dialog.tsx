import { NotPortedDialog } from '@/components/layouts/not-ported';

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
}

// サイドバーの「新しいチャット」から開く（移植元 shared/layouts/sidebar/components/new-chat-dialog と sidebar の作成ダイアログ）。
// #284 でこのファイルを本物に置き換える。サイドバーは open・onClose を渡すだけなので触らなくてよい
export function NewChatDialog({ open, onClose }: NewChatDialogProps) {
  return (
    <NotPortedDialog name="NewChatDialogComponent" issue={284} open={open} onClose={onClose} />
  );
}
