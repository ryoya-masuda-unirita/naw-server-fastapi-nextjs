import { useEffect, useMemo, useRef, useState, type MouseEvent, type UIEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ChatRenameDialog } from '@/components/features/chat/chat-rename-dialog';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { ChatSearchModal } from '@/components/features/chat/chat-search-modal';
import { NewChatDialog } from '@/components/features/chat/new-chat-dialog';
import { SIDEBAR_ITEM_HEIGHT_PX } from '@/lib/constants/layout';
import { ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useUiStore } from '@/store/ui-store';
import type { ActionItem, LayoutConfig, SectionGroup, UserMenuAction } from '@/types/layout';
import { AdminSidebar } from './sidebar/admin-sidebar';
import { BackSidebar } from './sidebar/back-sidebar';
import { ChatContextMenu } from './sidebar/chat-context-menu';
import { ChatDeleteDialog } from './sidebar/chat-delete-dialog';
import { ChatRoomMenu } from './sidebar/chat-room-menu';
import { ChatSortDialog } from './sidebar/chat-sort-dialog';
import { SidebarHeaderSection } from './sidebar/sidebar-header-section';
import { SidebarRouteButton } from './sidebar/sidebar-route-button';
import { UserMenu } from './sidebar/user-menu';
import { resolveSidebarMode } from './sidebar-mode';
import { UsageDialog } from './usage-dialog';

interface SidebarProps {
  config: LayoutConfig;
}

type SidebarDialog = 'new-chat' | 'chat-search' | 'usage' | 'chat-delete' | 'chat-sort' | null;

interface RoomMenuState {
  isOpen: boolean;
  roomId: string | null;
  topPx: number;
  triggerTopPx: number;
  isPinned: boolean;
}

const CLOSED_ROOM_MENU: RoomMenuState = {
  isOpen: false,
  roomId: null,
  topPx: 0,
  triggerTopPx: 0,
  isPinned: false,
};

const CHAT_SECTION_LABEL_KEY = 'SIDEBAR.CHAT';
/** メニューの top をボタンの下端からどれだけ下げるか（移植元 rect.bottom + 4） */
const MENU_OFFSET_PX = 4;
/** ルーム一覧の末尾までこの距離に近づいたら次のページを読む（移植元 onSidebarScroll） */
const LOAD_NEXT_THRESHOLD_PX = 80;

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
  const [chatMenu, setChatMenu] = useState({ isOpen: false, topPx: 0 });
  const [roomMenu, setRoomMenu] = useState<RoomMenuState>(CLOSED_ROOM_MENU);
  const [renameRoomId, setRenameRoomId] = useState<string | null>(null);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const allRooms = useRoomsStore((s) => s.allRooms);
  const isRoomsLoading = useRoomsStore((s) => s.isAllRoomsLoading);
  const isRenamingRoom = useRoomsStore((s) => s.isRenamingRoom);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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

  // 移植元はコンストラクタで一覧の 1 ページ目を読む
  useEffect(() => {
    useRoomsStore
      .getState()
      .getAllRooms()
      .catch((error: unknown) => {
        console.error('Load rooms failed', error);
      });
  }, []);

  // チャットのセクションはいつも開いている（移植元の chatSectionCollapsed は切り替える手段がない）
  const chatSection = useMemo<SectionGroup>(
    () => ({
      labelKey: CHAT_SECTION_LABEL_KEY,
      collapsed: false,
      items: allRooms.map((room) => ({
        labelKey: room.name,
        route: config.chatRoomRoute(room.id),
        hasPin: room.isPinned,
        hasMenu: true,
        roomId: room.id,
      })),
    }),
    [allRooms, config]
  );
  const allSectionGroups = [...sectionGroups, chatSection];

  const toggleSection = (sectionIndex: number) => {
    setSectionGroups((sections) =>
      sections.map((section, index) =>
        index === sectionIndex ? { ...section, collapsed: !section.collapsed } : section
      )
    );
  };

  const getSectionHeight = (section: SectionGroup): string => {
    const isExpanded = !section.collapsed || sidebarCollapsed;
    const loadingHeight = showsRoomsLoading(section) ? SIDEBAR_ITEM_HEIGHT_PX : 0;
    return isExpanded ? `${section.items.length * SIDEBAR_ITEM_HEIGHT_PX + loadingHeight}px` : '0';
  };

  const showsRoomsLoading = (section: SectionGroup): boolean =>
    section.labelKey === CHAT_SECTION_LABEL_KEY && isRoomsLoading && !sidebarCollapsed;

  const onSidebarScroll = (event: UIEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return;
    const target = event.currentTarget;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom > LOAD_NEXT_THRESHOLD_PX) return;

    useRoomsStore
      .getState()
      .loadNextRoomsPage()
      .catch((error: unknown) => {
        console.error('Load next rooms page failed', error);
      });
  };

  const openRoomMenu = (event: MouseEvent<HTMLElement>, roomId: string, isPinned: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setRoomMenu({
      isOpen: true,
      roomId,
      topPx: rect.bottom + MENU_OFFSET_PX,
      triggerTopPx: rect.top,
      isPinned,
    });
  };

  const closeRoomMenu = () => setRoomMenu((state) => ({ ...state, isOpen: false }));

  const onTogglePinRoom = () => {
    const { roomId, isPinned } = roomMenu;
    if (!roomId) return;
    useRoomsStore
      .getState()
      .togglePinRoom({ id: roomId, isPinned })
      .catch((error: unknown) => {
        console.error('Toggle pin room failed', error);
      });
  };

  // 表示中のルームを消したら、新規チャットへ移る（移植元 handleDeletedRooms）
  const handleDeletedRooms = (roomIds: string[]) => {
    const currentPath = normalizePath(pathname);
    const isCurrentRoomDeleted = roomIds.some(
      (roomId) => currentPath === normalizePath(config.chatRoomRoute(roomId))
    );
    if (!isCurrentRoomDeleted) return;

    useChatStore.getState().startNewChat();
    navigate(config.chatNewRoute);
  };

  const submitRename = async (name: string) => {
    if (!renameRoomId) return;
    try {
      await useRoomsStore.getState().renameRoom(renameRoomId, name);
      setRenameRoomId(null);
    } catch (error) {
      // 失敗したらダイアログを開いたままにする（エラートーストは api-client が出す）
      console.error('Rename room failed', error);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!deleteRoomId) return;
    setIsDeletingRoom(true);
    try {
      await useRoomsStore.getState().deleteRoom(deleteRoomId);
      handleDeletedRooms([deleteRoomId]);
      setDeleteRoomId(null);
    } catch (error) {
      console.error('Delete room failed', error);
    } finally {
      setIsDeletingRoom(false);
    }
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
        setLogoutConfirmOpen(true);
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

            <div
              onScroll={onSidebarScroll}
              className={`sidebar-scroll flex-1 overflow-x-hidden overflow-y-auto ${
                sidebarCollapsed ? 'px-2' : 'px-3'
              }`}
            >
              {allSectionGroups.map((section, sectionIndex) => (
                <div key={section.labelKey} className="mb-6">
                  <SidebarHeaderSection
                    section={section}
                    sidebarCollapsed={sidebarCollapsed}
                    onToggle={() => toggleSection(sectionIndex)}
                  />

                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{
                      height:
                        section.labelKey === CHAT_SECTION_LABEL_KEY && sidebarCollapsed
                          ? '0px'
                          : getSectionHeight(section),
                    }}
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
                            onRoomMenuOpen={openRoomMenu}
                          />
                        )
                      )
                    )}
                    {showsRoomsLoading(section) && (
                      <div className="flex h-9 items-center justify-center">
                        <CircularLoading className="[&_svg]:h-5 [&_svg]:w-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!isBackMode && (
          <>
            {/* 「選択して削除」メニュー。移植元でも開くボタンがどこにもない（openChatMenu を呼ぶ箇所がない） */}
            <ChatContextMenu
              isOpen={chatMenu.isOpen}
              chatMenuTopPx={chatMenu.topPx}
              onDeleteSelected={() => {
                setChatMenu((state) => ({ ...state, isOpen: false }));
                setOpenDialog('chat-delete');
              }}
              onClose={() => setChatMenu((state) => ({ ...state, isOpen: false }))}
            />
            <ChatRoomMenu
              isOpen={roomMenu.isOpen}
              isPinned={roomMenu.isPinned}
              topPx={roomMenu.topPx}
              triggerTopPx={roomMenu.triggerTopPx}
              onRename={() => setRenameRoomId(roomMenu.roomId)}
              onTogglePin={onTogglePinRoom}
              onDelete={() => setDeleteRoomId(roomMenu.roomId)}
              onClose={closeRoomMenu}
            />
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
      {openDialog === 'chat-delete' && (
        <ChatDeleteDialog
          onClose={(deletedRoomIds) => {
            closeDialog();
            if (deletedRoomIds?.length) handleDeletedRooms(deletedRoomIds);
          }}
        />
      )}
      {/* 移植元でも openSortDialog を呼ぶ箇所がない。部品だけ移してある */}
      {openDialog === 'chat-sort' && <ChatSortDialog onClose={closeDialog} />}
      {renameRoomId && (
        <ChatRenameDialog
          initialName={allRooms.find((room) => room.id === renameRoomId)?.name ?? ''}
          title={t('SIDEBAR.RENAME_CHAT')}
          cancelText={t('SIDEBAR.CANCEL')}
          confirmText={t('SIDEBAR.SAVE')}
          confirmLoading={isRenamingRoom}
          onSave={(name) => void submitRename(name)}
          onCancel={() => setRenameRoomId(null)}
        />
      )}
      {/* 移植元 openConfirmDeleteDialog と同じ指定 */}
      <Dialog
        open={deleteRoomId !== null}
        title={t('SIDEBAR.DELETE_DIALOG.CONFIRM_TITLE')}
        message={t('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('COMMON.DELETE')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        confirmLoading={isDeletingRoom}
        buttonAlign="center"
        dialogWidth="800px"
        onConfirm={() => void confirmDeleteRoom()}
        onCancel={() => setDeleteRoomId(null)}
        onClose={() => setDeleteRoomId(null)}
      />
      {/* 移植元 openLogoutConfirmDialog と同じ指定 */}
      <Dialog
        open={logoutConfirmOpen}
        title={t('USER_MENU.LOGOUT_CONFIRM_TITLE')}
        message={t('USER_MENU.LOGOUT_CONFIRM_MESSAGE')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('USER_MENU.LOGOUT')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="logout"
        buttonAlign="center"
        dialogWidth="800px"
        onConfirm={() => {
          void logout();
          setLogoutConfirmOpen(false);
        }}
        onClose={() => setLogoutConfirmOpen(false)}
      />
    </>
  );
}
