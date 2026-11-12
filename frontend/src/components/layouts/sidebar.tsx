import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { ChatSearchModal } from '@/components/features/chat/chat-search-modal';
import { NewChatDialog } from '@/components/features/chat/new-chat-dialog';
import { SIDEBAR_ITEM_HEIGHT_PX } from '@/lib/constants/layout';
import { ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import type { ActionItem, LayoutConfig, SectionGroup, UserMenuAction } from '@/types/layout';
import { AdminSidebar } from './sidebar/admin-sidebar';
import { BackSidebar } from './sidebar/back-sidebar';
import { SidebarHeaderSection } from './sidebar/sidebar-header-section';
import { SidebarRouteButton } from './sidebar/sidebar-route-button';
import { UserMenu } from './sidebar/user-menu';
import { resolveSidebarMode } from './sidebar-mode';
import { UsageDialog } from './usage-dialog';

interface SidebarProps {
  config: LayoutConfig;
}

type SidebarDialog = 'new-chat' | 'chat-search' | 'usage' | null;

const RANABASE_LABEL_KEY = 'SIDEBAR.RANABASE';

// クエリ文字列・ハッシュ・末尾のスラッシュを除いて比べる（移植元 refreshAssistantsAndTemplatesOnChatEntry と同じ）
const normalizePath = (path: string): string => path.split(/[?#]/)[0].replace(/\/$/, '');

/** 移植元 shared/layouts/sidebar/sidebar.component（aside 部分。オーバーレイとメイン領域は AdminLayout） */
export function Sidebar({ config }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, closeMobileSidebar } = useUiStore();
  const { user, userName, isAdmin, isGroupAdminOnly, canAccessAdminConsole, logout } =
    useAuthStore();

  const [sectionGroups, setSectionGroups] = useState<SectionGroup[]>(() =>
    config.sectionGroups.map((section) => ({ ...section }))
  );
  const [openDialog, setOpenDialog] = useState<SidebarDialog>(null);

  const mode = resolveSidebarMode(pathname, config);
  const isAdminMode = mode === 'admin';
  const isBackMode = mode === 'back';

  // 移植元は NavigationEnd（遷移完了）ごとに行う処理。初回描画では行わない。
  // 「初回か」のフラグだと StrictMode の effect 二重実行で初回にも走るため、前回の pathname と比べる
  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    closeMobileSidebar();

    // アシスタント/テンプレートは画面遷移では再取得されないため、新規チャットに入るときに明示的に更新する
    const path = normalizePath(pathname);
    if (path === config.dashboardRoute || path === config.chatNewRoute) {
      void queryClient.invalidateQueries({ queryKey: ['assistants'] });
      void queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
    }
  }, [pathname, config, closeMobileSidebar, queryClient]);

  const toggleSection = (sectionIndex: number) => {
    setSectionGroups((sections) =>
      sections.map((section, index) =>
        index === sectionIndex ? { ...section, collapsed: !section.collapsed } : section
      )
    );
  };

  const getSectionHeight = (section: SectionGroup): string => {
    const isExpanded = !section.collapsed || sidebarCollapsed;
    return isExpanded ? `${section.items.length * SIDEBAR_ITEM_HEIGHT_PX}px` : '0';
  };

  const onActionItemClick = (item: ActionItem) => {
    if (item.labelKey === 'SIDEBAR.SEARCH_CHAT') {
      setOpenDialog('chat-search');
    } else if (item.labelKey === 'SIDEBAR.NEW_CHAT') {
      setOpenDialog('new-chat');
    }
  };

  const switchRoleLabelKey = (): string => {
    if (isAdminMode) return 'USER_MENU.SWITCH_TO_CHAT';
    if (isGroupAdminOnly) return 'USER_MENU.SWITCH_TO_TEAM_MANAGEMENT';
    return 'USER_MENU.SWITCH_TO_ADMIN';
  };

  const userMenuActions = config.userMenuActions.map((action) =>
    action.action === 'switch-role' ? { ...action, labelKey: switchRoleLabelKey() } : action
  );

  const onUserMenuAction = (action: UserMenuAction) => {
    switch (action.action) {
      case 'password':
        // 移植元は router state でユーザーIDを渡す。React のパスワードリセット画面はクエリから読む
        navigate(`${ROUTES.AUTH.PW_RESET}?username=${encodeURIComponent(user?.id ?? '')}`);
        break;
      case 'logout':
        // 移植元は確認ダイアログ。共通 UI（#278）の確認ダイアログができたら置き換える
        if (
          window.confirm(
            `${t('USER_MENU.LOGOUT_CONFIRM_TITLE')}\n${t('USER_MENU.LOGOUT_CONFIRM_MESSAGE')}`
          )
        ) {
          void logout();
        }
        break;
      case 'switch-role':
        if (isAdminMode) {
          navigate(config.chatNewRoute);
        } else {
          navigate(isAdmin ? config.adminTenantRoute : ROUTES.APP.ADMIN_GROUPS);
        }
        break;
      case 'check-credit':
        setOpenDialog('usage');
        break;
    }
  };

  const closeDialog = () => setOpenDialog(null);

  return (
    <>
      <aside
        className={`fixed bottom-0 left-0 top-0 z-100 flex flex-col bg-white transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:z-99 before:bg-bg-brand-weak before:transition-all before:duration-300 before:content-[''] md:translate-x-0 ${
          sidebarCollapsed ? 'w-13' : 'w-60 md:w-64!'
        } ${sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full'} ${
          !sidebarCollapsed && sidebarMobileOpen ? 'z-102' : ''
        }`}
      >
        {isBackMode ? (
          <div className="flex-1 overflow-y-auto p-3">
            <BackSidebar onGoToBack={() => navigate(-1)} />
          </div>
        ) : (
          <div
            className={`mb-6 flex w-full items-center justify-between pt-3 ${
              sidebarCollapsed ? 'px-2' : 'px-3'
            }`}
          >
            <Link to={config.dashboardRoute} className="flex items-center">
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
              className="h-9! w-9! shrink-0 rounded-full p-1.5 transition-all duration-200 hover:bg-bg-brand-weak md:block"
            >
              <span className="flex items-center justify-center text-primary">
                <SvgIcon name="toggleSidebar" className="h-5 w-5" />
              </span>
            </button>
          </div>
        )}

        {isAdminMode && (
          <div className="flex-1 overflow-y-auto">
            <AdminSidebar />
          </div>
        )}

        {mode === 'default' && (
          <>
            <div className={`mb-6 shrink-0 md:mb-9 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              <div>
                {config.actionItems.map((item) =>
                  !item.route.startsWith('#') ? (
                    <NavLink
                      key={item.labelKey}
                      to={item.route}
                      title={t(item.labelKey)}
                      className={({ isActive }) =>
                        `flex h-9 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-normal text-text-default transition-colors hover:bg-bg-brand-weak! ${
                          isActive ? 'bg-bg-brand-strong! text-primary!' : ''
                        }`
                      }
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <SvgIcon name={item.icon} className="h-5 w-5" />
                      </span>
                      <span
                        className={`flex-1 whitespace-nowrap font-medium transition-all ${
                          sidebarCollapsed ? 'invisible opacity-0' : ''
                        }`}
                      >
                        {t(item.labelKey)}
                      </span>
                    </NavLink>
                  ) : (
                    <button
                      key={item.labelKey}
                      type="button"
                      data-testid={
                        item.labelKey === 'SIDEBAR.SEARCH_CHAT' ? 'chat-search-button' : undefined
                      }
                      title={t(item.labelKey)}
                      onClick={() => onActionItemClick(item)}
                      className={`flex h-9 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-normal text-text-default transition-colors hover:bg-bg-brand-weak ${
                        sidebarCollapsed ? 'w-9' : 'w-full'
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <SvgIcon name={item.icon} className="h-5 w-5" />
                      </span>
                      <span
                        className={`flex-1 origin-left whitespace-nowrap font-medium transition-all duration-300 ${
                          sidebarCollapsed ? 'invisible opacity-0' : ''
                        }`}
                      >
                        {t(item.labelKey)}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* ルーム一覧（チャットのセクション・スクロールでの追加読み込み）は #285 でここに足す */}
            <div
              className={`sidebar-scroll flex-1 overflow-x-hidden overflow-y-auto ${
                sidebarCollapsed ? 'px-2' : 'px-3'
              }`}
            >
              {sectionGroups.map((section, sectionIndex) => (
                <div key={section.labelKey} className="mb-6">
                  <SidebarHeaderSection
                    section={section}
                    sidebarCollapsed={sidebarCollapsed}
                    onToggle={() => toggleSection(sectionIndex)}
                  />

                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ height: getSectionHeight(section) }}
                  >
                    {section.items.map((item) =>
                      item.labelKey === RANABASE_LABEL_KEY ? (
                        <button
                          key={item.labelKey}
                          type="button"
                          title={t(item.labelKey)}
                          // 移植元は noopener を付けていないが、外部サイトに window.opener を渡さない（逆タブナビング対策）
                          onClick={() =>
                            window.open(config.externalSiteUrl, '_blank', 'noopener,noreferrer')
                          }
                          className="group flex h-9 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-normal text-text-default transition-colors hover:bg-bg-brand-weak"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                            <img
                              src={item.icon}
                              className="h-5 w-5 rounded"
                              alt={t(item.labelKey)}
                            />
                          </span>
                          <span
                            className={`flex-1 origin-left overflow-hidden text-ellipsis whitespace-nowrap font-medium transition-all duration-300 ${
                              sidebarCollapsed ? 'invisible opacity-0' : ''
                            }`}
                          >
                            {t(item.labelKey)}
                          </span>
                        </button>
                      ) : (
                        item.route && (
                          <SidebarRouteButton
                            key={item.roomId ?? item.labelKey}
                            item={{ ...item, route: item.route }}
                            sidebarCollapsed={sidebarCollapsed}
                          />
                        )
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          aria-label="close-mobile-sidebar-button"
          onClick={closeMobileSidebar}
          className={`absolute right-0 top-0 z-50 ml-2 flex h-4 w-4 translate-x-5 items-center justify-center rounded-full bg-text-strong transition-colors hover:bg-bg-brand-weak md:hidden! ${
            sidebarMobileOpen ? '' : 'hidden'
          }`}
        >
          <SvgIcon name="close" className="h-3 w-3 text-white!" />
        </button>

        <div
          className={`mb-1 flex h-14 items-center border-t border-text-lighter p-2 ${isBackMode ? 'hidden' : ''}`}
        >
          <UserMenu
            actions={userMenuActions}
            userName={userName}
            sidebarCollapsed={sidebarCollapsed}
            canShowSwitchRole={canAccessAdminConsole}
            onAction={onUserMenuAction}
          />
        </div>
      </aside>

      {/* aside は transform を持ち fixed の基準になってしまうため、ダイアログは aside の外に置く（移植元は MatDialog で body 直下に出す） */}
      <NewChatDialog open={openDialog === 'new-chat'} onClose={closeDialog} />
      <ChatSearchModal open={openDialog === 'chat-search'} onClose={closeDialog} />
      <UsageDialog open={openDialog === 'usage'} onClose={closeDialog} />
    </>
  );
}
