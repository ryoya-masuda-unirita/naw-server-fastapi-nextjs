import { Outlet } from 'react-router-dom';
import { MdMenu } from 'react-icons/md';
import { useUiStore } from '@/store/ui-store';
import { Sidebar } from './sidebar';

export function AppLayout() {
  const { sidebarCollapsed, sidebarMobileOpen, toggleMobileSidebar, closeMobileSidebar } =
    useUiStore();

  return (
    <div className="flex h-screen overflow-y-auto">
      <Sidebar />

      <button
        type="button"
        aria-label="open-mobile-sidebar"
        onClick={toggleMobileSidebar}
        className="fixed left-3 top-3 z-[101] rounded-full bg-surface-white p-1.5 shadow-md md:hidden"
      >
        <MdMenu className="size-5 text-primary" />
      </button>

      <button
        type="button"
        aria-label="close-mobile-sidebar"
        onClick={closeMobileSidebar}
        className={`fixed inset-0 z-[99] bg-black/50 transition-all md:hidden ${
          sidebarMobileOpen ? 'opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
      />

      <div
        className={`flex h-screen flex-1 flex-col overflow-hidden bg-surface-white transition-all duration-300 ${
          sidebarCollapsed ? 'md:ml-13' : 'md:ml-64'
        }`}
      >
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
