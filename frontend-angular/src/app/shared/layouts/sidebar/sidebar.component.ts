import { CommonModule, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
  TemplateRef,
  Type,
  ViewChild,
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { I18nService } from '@core/i18n/i18n.service';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { UiStore } from '@core/stores/ui.store';
import { ChatSearchModalComponent } from '@features/chat/components/chat-search-modal/chat-search-modal.component';
import { ChatService } from '@features/chat/services/chat.service';
import { UserService } from '@core/services/user.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { NewChatDialogComponent } from './components/new-chat-dialog/new-chat-dialog.component';

import {
  ChatSortDialogActionBridge,
  ChatSortDialogComponent,
} from '@layouts/admin-layout/components/chat-sort-dialog/chat-sort-dialog.component';
import {
  ChatDeleteDialogActionBridge,
  ChatDeleteDialogComponent,
} from '@layouts/admin-layout/components/chat-delete-dialog/chat-delete-dialog.component';
import {
  ChatRenameDialogComponent,
  ChatRenameDialogActionBridge,
} from '@features/chat/components/chat-rename-dialog/chat-rename-dialog.component';
import { BackSidebarComponent } from '@app/layouts/admin-layout/components/back-sidebar/back-sidebar.component';
import { AdminSidebarComponent } from '@layouts/admin-layout/components/admin-sidebar/admin-sidebar.component';
import { UsageDialogComponent } from '@layouts/admin-layout/components/usage-dialog/usage-dialog.component';
import { ChatContextMenuComponent } from './components/chat-context-menu/chat-context-menu.component';
import { ChatRoomMenuComponent } from './components/chat-room-menu/chat-room-menu.component';
import { UserMenuComponent } from './components/user-menu/user-menu.component';
import { SidebarHeaderSectionComponent } from './components/sidebar-header-section/sidebar-header-section.component';
import { SidebarRouteButtonComponent } from './components/sidebar-route-button/sidebar-route-button.component';
import { SidebarButtonComponent } from './components/sidebar-button/sidebar-button.component';
import { LibraryBookIconComponent } from '@shared/components/icons/library-book-icon.component';

import type { LayoutConfig, MenuItem, SectionGroup, UserMenuAction } from '@app-types/layout.type';
import { PARENT_OF_SCREEN_USE_BACK_SIDEBAR, SCREEN_USE_BACK_SIDEBAR } from '@app/core/constants';
import { ROUTES } from '@core/constants/routes.config';
import { isValidRoomName, normalizeRoomName } from '@core/utils/room-name.helpers';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatMenuModule,
    TranslateModule,
    AdminSidebarComponent,
    ButtonComponent,
    NewChatDialogComponent,
    ChatContextMenuComponent,
    ChatRoomMenuComponent,
    UserMenuComponent,
    BackSidebarComponent,
    SvgIconComponent,
    SidebarHeaderSectionComponent,
    SidebarRouteButtonComponent,
    SidebarButtonComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit {
  // ── Injected services ──
  readonly authStore = inject(AuthStore);
  readonly uiStore = inject(UiStore);
  private readonly dialog = inject(MatDialog);
  private readonly i18nService = inject(I18nService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly chatService = inject(ChatService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly queryClient = inject(QueryClient);

  // ── Input: layout config (admin vs user) ──
  readonly config = input.required<LayoutConfig>();

  // ── ViewChild refs ──
  @ViewChild('newChatContent') newChatContent!: TemplateRef<unknown>;
  @ViewChild('newChatActions') newChatActions!: TemplateRef<unknown>;

  // ── Signals ──
  readonly userName = signal('');
  readonly newChatAssistantId = signal<string | null>(null);
  readonly isCreatingRoom = this.chatService.isCreatingRoom;
  readonly isRoomsLoading = this.chatService.isAllRoomsLoading;
  private newChatDialogRef: MatDialogRef<DialogComponent> | null = null;

  private readonly chatSectionCollapsed = signal(false);
  readonly chatSortDirection = signal<'desc' | 'asc'>('desc');
  readonly chatMenuOpen = signal(false);
  readonly chatMenuTopPx = signal(0);
  readonly roomMenuState = signal<{
    isOpen: boolean;
    roomId: string | null;
    topPx: number;
    triggerTopPx: number;
    isPinned: boolean;
  }>({
    isOpen: false,
    roomId: null,
    topPx: 0,
    triggerTopPx: 0,
    isPinned: false,
  });

  // ── Computed helpers ──
  readonly isAdmin = computed(() => this.config().role === 'admin');

  readonly actionItems = computed(() => this.config().actionItems);

  readonly sectionGroups = signal<SectionGroup[]>([]);

  readonly chatSection = computed<SectionGroup>(() => {
    const rooms = this.chatService.allRooms();
    const cfg = this.config();
    return {
      labelKey: 'SIDEBAR.CHAT',
      collapsed: this.chatSectionCollapsed(),
      items: rooms.map((room) => ({
        labelKey: room.name,
        route: cfg.chatRoomRoute(room.id),
        hasPin: room.isPinned,
        hasMenu: true,
        roomId: room.id,
      })),
    };
  });

  readonly allSectionGroups = computed<SectionGroup[]>(() => [
    ...this.sectionGroups(),
    this.chatSection(),
  ]);

  readonly userMenuActions = computed<UserMenuAction[]>(() =>
    this.config().userMenuActions.map((action) => {
      if (action.action !== 'switch-role') {
        return action;
      }

      if (this.uiStore.isAdminMode()) {
        return { ...action, labelKey: 'USER_MENU.SWITCH_TO_CHAT' };
      }

      if (this.authStore.isGroupAdminOnly()) {
        return { ...action, labelKey: 'USER_MENU.SWITCH_TO_TEAM_MANAGEMENT' };
      }

      return { ...action, labelKey: 'USER_MENU.SWITCH_TO_ADMIN' };
    }),
  );

  // ── Icon component mapping ──
  readonly iconComponents: Record<string, Type<any>> = {
    'app-library-book-icon': LibraryBookIconComponent,
  };

  private readonly currentRoute = signal<string>('');

  readonly pageTitleKey = computed(() => {
    const route = this.currentRoute();
    const cfg = this.config();

    if (this.uiStore.isAdminMode()) {
      const sortedRoutes = Object.keys(cfg.adminTitleMap).sort((a, b) => b.length - a.length);
      for (const adminRoute of sortedRoutes) {
        if (route.startsWith(adminRoute)) {
          return cfg.adminTitleMap[adminRoute];
        }
      }
      return 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE';
    }

    return 'PAGE.INVENTORY_OPTIMIZATION';
  });

  readonly hideHeader = computed(() => {
    const route = this.currentRoute();
    const cfg = this.config();
    return route.startsWith(`/${cfg.role}/chat/`) && !route.endsWith('/search');
  });

  readonly mobileMenuOpen = signal(false);

  // Language management
  readonly currentLanguage = signal<string>('ja');
  readonly availableLanguages = ['ja', 'en'];
  readonly currentLanguageDisplay = computed(() => {
    const lang = this.currentLanguage();
    return lang === 'ja' ? '日本語' : 'English';
  });

  constructor() {
    this.currentLanguage.set(this.i18nService.resolveLanguage());
    this.chatService.getAllRooms();
  }

  /**
   * Initialize after input is resolved.
   * `input.required` is NOT available in the constructor, so all logic
   * that depends on `this.config()` must live here or later.
   */
  ngOnInit(): void {
    // Initialize section groups from config
    this.sectionGroups.set(this.config().sectionGroups.map((s) => ({ ...s })));

    // Subscribe to route changes
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentRoute.set(event.urlAfterRedirects);
        this.checkAdminRoute(event.urlAfterRedirects);
        this.checkUseBackSidebar(event.urlAfterRedirects);
        this.refreshAssistantsAndTemplatesOnChatEntry(event.urlAfterRedirects);
        this.uiStore.closeMobileSidebar();
      });

    // Check initial route
    this.currentRoute.set(this.router.url);
    this.checkAdminRoute(this.router.url);
    this.checkUseBackSidebar(this.router.url);
  }

  // アシスタント/テンプレートはシングルトンサービスにキャッシュされ画面遷移では自動再取得されないため、ダッシュボード/新規チャット画面への遷移時に明示的に更新する
  private refreshAssistantsAndTemplatesOnChatEntry(url: string): void {
    const path = url.split(/[?#]/)[0].replace(/\/$/, '');
    const cfg = this.config();
    if (path !== cfg.dashboardRoute && path !== cfg.chatNewRoute) return;

    void this.queryClient.invalidateQueries({ queryKey: ['assistants'] });
    void this.queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
  }

  // ── Chat menu ──
  openChatMenu(event: MouseEvent): void {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    this.chatMenuTopPx.set(rect.bottom + 4);
    this.chatMenuOpen.set(true);
    event.stopPropagation();
  }

  closeChatMenu(): void {
    this.chatMenuOpen.set(false);
  }

  openDeleteDialog(): void {
    this.chatMenuOpen.set(false);
    const selectedCount = signal(0);
    const actionBridge: ChatDeleteDialogActionBridge = {
      selectedCount,
    };
    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('SIDEBAR.DELETE_CHAT_DIALOG_TITLE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'right',
        contentComponent: ChatDeleteDialogComponent,
        contentComponentInputs: {
          actionBridge,
        },
        contentClass: 'pb-0! md:pb-0! min-h-0 flex flex-col',
        confirmDisabledSignal: computed(() => selectedCount() === 0),
        confirmAction: () => actionBridge.runDelete?.(),
        cancelAction: () => actionBridge.runCancel?.(),
      } as DialogData,
    });

    dialogRef.afterClosed().subscribe((deletedRoomIds: string[] | null) => {
      if (deletedRoomIds?.length) {
        this.handleDeletedRooms(deletedRoomIds);
      }
    });
  }

  openSortDialog(): void {
    this.chatMenuOpen.set(false);
    const actionBridge: ChatSortDialogActionBridge = {};
    this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: 'calc(100vh - 80px)',
      data: {
        title: this.translate.instant('SIDEBAR.SORT_CHAT_DIALOG_TITLE'),
        cancelText: this.translate.instant('SIDEBAR.CANCEL'),
        confirmText: this.translate.instant('SIDEBAR.SAVE'),
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        contentComponent: ChatSortDialogComponent,
        contentComponentInputs: {
          actionBridge,
        },
        contentClass: 'overflow-hidden! min-h-0 flex flex-col',
        confirmLoadingSignal: this.chatService.isReorderingRooms,
        confirmAction: () => actionBridge.runSave?.(),
        cancelAction: () => actionBridge.runCancel?.(),
      } as DialogData,
    });
  }

  // ── Route checks ──
  private isAdminManagementRoute(url: string): boolean {
    const cfg = this.config();
    return Object.keys(cfg.adminTitleMap).some((route) => url.startsWith(route));
  }

  private checkAdminRoute(url: string): void {
    if (!this.isAdminManagementRoute(url)) {
      return;
    }

    if (this.authStore.isGroupAdminOnly() && !this.authStore.isGroupAdmin()) {
      this.handleGroupAdminAccessRevoked();
      return;
    }

    if (this.authStore.isGroupAdminOnly() && !url.startsWith(ROUTES.APP.ADMIN_GROUPS)) {
      void this.router.navigate([ROUTES.APP.ADMIN_GROUPS]);
      return;
    }

    this.uiStore.enterAdminMode();
  }

  private handleGroupAdminAccessRevoked(): void {
    this.uiStore.exitAdminMode();
    this.toast.info(this.translate.instant('USER_MENU.GROUP_ADMIN_ACCESS_REVOKED'));
    void this.router.navigate([this.config().chatNewRoute]);
  }

  private checkUseBackSidebar(url: string): void {
    if (this.isAdminManagementRoute(url)) return;

    const isUseBackSidebar =
      SCREEN_USE_BACK_SIDEBAR.some((path) => url.includes(path)) &&
      PARENT_OF_SCREEN_USE_BACK_SIDEBAR.every((path) => path !== url);
    if (isUseBackSidebar) {
      this.uiStore.enterBackSidebarMode();
      return;
    }

    this.uiStore.exitResetSidebarMode();
  }

  // ── Navigation ──
  navigateToAdmin(): void {
    this.uiStore.enterAdminMode();
    const target = this.authStore.isAdmin()
      ? this.config().adminTenantRoute
      : ROUTES.APP.ADMIN_GROUPS;
    this.router.navigate([target]);
  }

  openExternalServiceSite(): void {
    window.open(this.config().externalSiteUrl, '_blank');
  }

  backToChat(): void {
    this.uiStore.exitAdminMode();
    this.router.navigate([this.config().chatNewRoute]);
  }

  backToLibraryList(): void {
    this.uiStore.exitLibraryDetailMode();
    this.router.navigate([this.config().libraryRoute]);
  }

  goToBack(): void {
    this.uiStore.exitResetSidebarMode();
    this.location.back();
  }

  // ── Section toggle ──
  toggleSection(sectionIndex: number): void {
    const staticSectionsCount = this.sectionGroups().length;

    if (sectionIndex < staticSectionsCount) {
      this.sectionGroups.update((sections) => {
        const newSections = [...sections];
        newSections[sectionIndex] = {
          ...newSections[sectionIndex],
          collapsed: !newSections[sectionIndex].collapsed,
        };
        return newSections;
      });
      return;
    }

    // Dynamic chat section
    if (sectionIndex === staticSectionsCount) {
      this.chatSectionCollapsed.update((v) => !v);
    }
  }

  getSectionHeight(section: SectionGroup): string {
    const isExpanded = !section.collapsed || this.uiStore.sidebarCollapsed();
    const loadingHeight =
      section.labelKey === 'SIDEBAR.CHAT' &&
      this.isRoomsLoading() &&
      !this.uiStore.sidebarCollapsed()
        ? 36
        : 0;
    return isExpanded ? `${section.items.length * 36 + loadingHeight}px` : '0';
  }

  onSidebarScroll(event: Event): void {
    if (this.chatSectionCollapsed() || this.uiStore.sidebarCollapsed()) return;

    const target = event.currentTarget as HTMLElement;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom > 80) return;

    void this.chatService.loadNextRoomsPage();
  }

  // ── Language ──
  toggleLanguage(): void {
    const nextLang = this.currentLanguage() === 'ja' ? 'en' : 'ja';
    void this.i18nService.setLanguage(nextLang).then(() => {
      this.currentLanguage.set(nextLang);
    });
  }

  openUsageDialog(): void {
    this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('USER_MENU.CHECK_CREDIT'),
        contentComponent: UsageDialogComponent,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        showConfirm: false,
        buttonAlign: 'center',
      } as DialogData,
    });
  }

  // ── Action item click ──
  onActionItemClick(item: MenuItem): void {
    if (item.labelKey === 'SIDEBAR.SEARCH_CHAT') {
      this.openChatSearchModal();
    } else if (item.labelKey === 'SIDEBAR.NEW_CHAT') {
      this.openNewChatDialog();
    }
  }

  // ── User menu action ──
  onUserMenuAction(action: UserMenuAction): void {
    switch (action.action) {
      case 'password':
        void this.router.navigate([ROUTES.AUTH.PW_RESET]);
        break;
      case 'logout':
        this.openLogoutConfirmDialog();
        break;
      case 'switch-role':
        if (this.uiStore.isAdminMode()) {
          this.backToChat();
        } else {
          this.navigateToAdmin();
        }
        break;
      case 'check-credit':
        this.openUsageDialog();
        break;
    }
  }

  private openLogoutConfirmDialog(): void {
    const dialogData: DialogData = {
      title: this.translate.instant('USER_MENU.LOGOUT_CONFIRM_TITLE'),
      message: this.translate.instant('USER_MENU.LOGOUT_CONFIRM_MESSAGE'),
      cancelText: this.translate.instant('COMMON.CANCEL'),
      confirmText: this.translate.instant('USER_MENU.LOGOUT'),
      showCancel: true,
      showConfirm: true,
      confirmDanger: true,
      confirmIcon: 'logout',
      confirmLoading: false,
      buttonAlign: 'center',
    };

    const confirmRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData,
    });

    dialogData.confirmAction = () => {
      this.authStore.logout();
      confirmRef.close(true);
    };

    dialogData.cancelAction = () => confirmRef.close(false);
  }

  // ── New chat dialog ──
  private openNewChatDialog(): void {
    this.newChatAssistantId.set(null);
    this.newChatDialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      panelClass: 'dialog-overflow-visible',
      data: {
        title: this.translate.instant('CHAT.WINDOW.CREATE_ROOM_TITLE'),
        content: this.newChatContent,
        customActions: this.newChatActions,
        buttonAlign: 'right',
      } as DialogData,
    });

    this.newChatDialogRef.afterClosed().subscribe((result: string | null) => {
      if (result) {
        // result is the new room ID from confirmNewChat
        this.router.navigate([this.config().chatRoomRoute(result)]);
      }
    });
  }

  confirmNewChat(): void {
    const assistantId = this.newChatAssistantId();
    if (!assistantId) return;
    this.chatService
      .createNewRoom(assistantId)
      .then((newRoomId) => {
        this.newChatDialogRef?.close(newRoomId);
      })
      .catch(() => {
        /* keep dialog open on error */
      });
  }

  cancelNewChat(): void {
    this.newChatDialogRef?.close(null);
  }

  // ── Room item menu ──
  openRoomMenu(event: MouseEvent, roomId: string, isPinned: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    this.roomMenuState.set({
      isOpen: true,
      roomId,
      topPx: rect.bottom + 4,
      triggerTopPx: rect.top,
      isPinned,
    });
  }

  closeRoomMenu(): void {
    this.roomMenuState.update((s) => ({ ...s, isOpen: false }));
  }

  onRenameRoom(): void {
    const roomId = this.roomMenuState().roomId;
    if (!roomId) return;

    const room = this.chatService.allRooms().find((r) => r.id === roomId);
    const roomName = signal(room?.name ?? '');
    const isRenameDisabled = computed(() => !isValidRoomName(roomName()));

    const submitRename = (): void => {
      if (isRenameDisabled()) return;
      void this.chatService
        .renameRoom(roomId, normalizeRoomName(roomName()))
        .then(() => dialogRef.close(true));
    };

    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('SIDEBAR.RENAME_CHAT'),
        confirmText: this.translate.instant('SIDEBAR.SAVE'),
        cancelText: this.translate.instant('SIDEBAR.CANCEL'),
        buttonAlign: 'right',
        showCancel: true,
        showConfirm: true,
        contentComponent: ChatRenameDialogComponent,
        contentComponentInputs: {
          actionBridge: {
            name: roomName,
            isLoading: this.chatService.isRenamingRoom,
            runCancel: () => dialogRef.close(false),
            runSave: submitRename,
          } as ChatRenameDialogActionBridge,
        },
        confirmLoadingSignal: this.chatService.isRenamingRoom,
        confirmDisabledSignal: isRenameDisabled,
        confirmAction: submitRename,
        cancelAction: () => dialogRef.close(false),
      } as DialogData,
    });
  }

  onTogglePinRoom(): void {
    const { roomId, isPinned } = this.roomMenuState();
    if (!roomId) return;
    void this.chatService.togglePinRoom({ id: roomId, isPinned });
  }

  openConfirmDeleteDialog(): void {
    const roomId = this.roomMenuState().roomId;
    if (!roomId) return;
    const dialogRef: DialogData = {
      title: this.translate.instant('SIDEBAR.DELETE_DIALOG.CONFIRM_TITLE'),
      message: this.translate.instant('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC'),
      cancelText: this.translate.instant('COMMON.CANCEL'),
      confirmText: this.translate.instant('COMMON.DELETE'),
      showCancel: true,
      showConfirm: true,
      confirmDanger: true,
      confirmIcon: 'delete',
      confirmLoading: false,
      buttonAlign: 'center',
    };

    const confirmRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogRef,
    });

    dialogRef.confirmAction = () => {
      dialogRef.confirmLoading = true;
      void this.chatService.deleteRoom(roomId).then(() => {
        this.handleDeletedRooms([roomId]);
        confirmRef.close(true);
      });
    };

    dialogRef.cancelAction = () => confirmRef.close(false);
  }

  private handleDeletedRooms(roomIds: string[]): void {
    if (!this.isCurrentChatRoomDeleted(roomIds)) return;

    this.chatService.startNewChat();
    void this.router.navigate([this.config().chatNewRoute]);
  }

  private isCurrentChatRoomDeleted(roomIds: string[]): boolean {
    const normalizePath = (path: string): string => path.split(/[?#]/)[0].replace(/\/$/, '');
    const currentPath = normalizePath(this.currentRoute());
    return roomIds.some(
      (roomId) => currentPath === normalizePath(this.config().chatRoomRoute(roomId)),
    );
  }

  private openChatSearchModal(): void {
    this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('CHAT.SEARCH_MODAL.TITLE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showConfirm: false,
        buttonAlign: 'center',
        showCancel: true,
        contentComponent: ChatSearchModalComponent,
      },
    });
  }
}
