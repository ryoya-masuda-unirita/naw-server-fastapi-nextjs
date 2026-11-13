import { NotPortedPage } from '@/components/layouts/not-ported';

// 仮の画面。#134 で移植元 features/admin/management/chat-history を移植し、このファイルの中身を本物に置き換える（export 名は変えない）。
// ルート定義（routes/index.tsx）・ルート定数・サイドバーは設定済みのため触らなくてよい
export function ChatHistoryPage() {
  return <NotPortedPage name="ChatHistoryPageComponent" issue={134} />;
}
