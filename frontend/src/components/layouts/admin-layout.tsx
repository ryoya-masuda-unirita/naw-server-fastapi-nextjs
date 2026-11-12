import { Outlet } from 'react-router-dom';
import { ADMIN_LAYOUT_CONFIG } from '@/lib/constants/layout';
import { useUiStore } from '@/store/ui-store';
import { Sidebar } from './sidebar';

/**
 * 移植元 layouts/admin-layout（= sidebar.component.html のサイドバー・モバイルのオーバーレイ・メイン領域）。
 * ログイン済みの全画面（一般ユーザーを含む）がこのレイアウトを使う。
 * モバイルでサイドバーを開くボタンは移植元どおりページヘッダー（#278 の page-header）にあるため、ここには置かない。
 */
export function AdminLayout() {
  const { sidebarCollapsed, sidebarMobileOpen, closeMobileSidebar } = useUiStore();

  return (
    <div className="flex h-screen overflow-y-auto">
      <Sidebar config={ADMIN_LAYOUT_CONFIG} />

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
