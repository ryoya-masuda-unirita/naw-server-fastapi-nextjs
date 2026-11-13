import { Outlet } from 'react-router-dom';
import { MdMenu } from 'react-icons/md';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { useUiStore } from '@/store/ui-store';
import { Sidebar } from './sidebar';

/**
 * 移植元 layouts/admin-layout（= sidebar.component.html のサイドバー・モバイルのオーバーレイ・メイン領域）。
 * ログイン済みの全画面（一般ユーザーを含む）がこのレイアウトを使う。
 */
export function AdminLayout() {
  const { sidebarCollapsed, sidebarMobileOpen, toggleMobileSidebar, closeMobileSidebar } =
    useUiStore();

  return (
    <div className="flex h-screen overflow-y-auto">
      <Sidebar config={ADMIN_LAYOUT_CONFIG} />

      {/* 仮のボタン。移植元ではモバイルでサイドバーを開くボタンはページヘッダー（page-header）にある。
          #278 の PageHeader に開閉ボタンが入り、各画面がそれを使うようになったらこのボタンは消す。
          それまでモバイルでサイドバー（ナビ・ログアウト）を開けなくなるのを防ぐため残している */}
      <button
        type="button"
        aria-label="open-mobile-sidebar"
        onClick={toggleMobileSidebar}
        className="fixed left-3 top-3 z-[101] rounded-full bg-surface-white p-1.5 shadow-md md:hidden"
      >
        <MdMenu className="size-5 text-primary" />
      </button>

      <div
        role="button"
        aria-label="close-mobile-sidebar"
        tabIndex={0}
        onClick={closeMobileSidebar}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeMobileSidebar();
        }}
        className={`fixed inset-0 z-99 bg-black/50 transition-all md:hidden ${
          sidebarMobileOpen ? '' : 'pointer-events-none invisible opacity-0'
        }`}
      />

      <div
        className={`flex h-screen flex-1 flex-col overflow-hidden bg-white transition-all duration-300 ${
          sidebarCollapsed ? 'md:ml-13' : 'md:ml-64'
        }`}
      >
        <main className="__sidebar flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
