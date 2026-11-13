import { NotPortedPage } from '@/components/layouts/not-ported';

// 仮の画面。#291 で移植元 features/admin/management/chat-history/chat-history-detail を移植し、このファイルの中身を本物に置き換える（export 名は変えない）。
// ルート定義（routes/index.tsx）・ルート定数・サイドバーは設定済みのため触らなくてよい
export function AdminChatHistoryDetailPage() {
  return <NotPortedPage name="AdminChatHistoryDetailComponent" issue={291} />;
}
