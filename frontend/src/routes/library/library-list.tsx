import { NotPortedPage } from '@/components/layouts/not-ported';

// 仮の画面。#136 で移植元 features/admin/library/library-list を移植し、このファイルの中身を本物に置き換える（export 名は変えない）。
// ルート定義（routes/index.tsx）・ルート定数・サイドバーは設定済みのため触らなくてよい
export function AdminLibraryPage() {
  return <NotPortedPage name="AdminLibraryComponent" issue={136} />;
}
