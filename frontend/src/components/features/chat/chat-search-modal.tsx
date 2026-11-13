import { NotPortedDialog } from '@/components/layouts/not-ported';

interface ChatSearchModalProps {
  open: boolean;
  onClose: () => void;
}

// サイドバーの「チャットを検索」から開く（移植元 features/chat/components/chat-search-modal）。
// #287 でこのファイルを本物に置き換える。サイドバーは open・onClose を渡すだけなので触らなくてよい
export function ChatSearchModal({ open, onClose }: ChatSearchModalProps) {
  return (
    <NotPortedDialog name="ChatSearchModalComponent" issue={287} open={open} onClose={onClose} />
  );
}
