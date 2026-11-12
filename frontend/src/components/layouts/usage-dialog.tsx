import { NotPortedDialog } from '@/components/layouts/not-ported';

interface UsageDialogProps {
  open: boolean;
  onClose: () => void;
}

// ユーザーメニューの「クレジット確認」から開く（移植元 layouts/admin-layout/components/usage-dialog）。
// 担当 Issue は未定。移植するときはこのファイルを本物に置き換える。サイドバーは open・onClose を渡すだけなので触らなくてよい
export function UsageDialog({ open, onClose }: UsageDialogProps) {
  return <NotPortedDialog name="UsageDialogComponent" open={open} onClose={onClose} />;
}
