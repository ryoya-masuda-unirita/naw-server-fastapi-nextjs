import { Link } from 'react-router-dom';
import { MdMenu } from 'react-icons/md';
import { useUiStore } from '@/store/ui-store';
import { ROUTES } from '@/lib/constants/routes';
import { UserMenu } from '@/components/shared/user-menu';

export function Sidebar() {
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, closeMobileSidebar } = useUiStore();

  return (
    <aside
      className={`before:pointer-events-none before:absolute before:inset-0 before:z-[99] before:bg-bg-brand-weak before:transition-all before:duration-300 before:content-[''] fixed left-0 top-0 bottom-0 z-[100] flex flex-col bg-surface-white transition-all duration-300 ${
        sidebarCollapsed ? 'w-13' : 'w-60 md:w-64!'
      } ${sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
    >
      <div
        className={`mb-6 flex w-full items-center justify-between pt-3 ${
          sidebarCollapsed ? 'px-2' : 'px-3'
        }`}
      >
        <Link to={ROUTES.APP.DASHBOARD} className="flex items-center">
          <img
            src="/secuaigent-logo.png"
            alt="SecuAiGent"
            className={`h-auto max-w-35 origin-left transition-all duration-200 md:max-w-39 ${
              sidebarCollapsed ? 'w-0 scale-0' : 'w-auto scale-100'
            }`}
          />
        </Link>
        <button
          type="button"
          aria-label="toggle-sidebar"
          onClick={() => (sidebarMobileOpen ? closeMobileSidebar() : toggleSidebar())}
          className="shrink-0 rounded-full p-1.5 transition-all duration-200 hover:bg-bg-brand-weak"
        >
          <span className="flex items-center justify-center text-primary">
            <MdMenu className="size-5" />
          </span>
        </button>
      </div>

      {/* ナビゲーション項目は未実装のため現時点では空。将来項目を追加する際はここに一覧表示を実装する */}
      <div className="flex-1 overflow-y-auto" />

      <div className="mb-1 flex h-14 items-center border-t border-border-light p-2">
        <UserMenu collapsed={sidebarCollapsed} />
      </div>
    </aside>
  );
}
