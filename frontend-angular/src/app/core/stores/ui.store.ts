/**
 * UI Store - Manages UI state (sidebar, theme, etc.)
 */
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light';
export type SidebarMode = 'default' | 'admin' | 'library-detail' | 'back';
@Injectable({ providedIn: 'root' })
export class UiStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _sidebarCollapsed = signal(false);
  private readonly _sidebarMobileOpen = signal(false);
  private readonly _sidebarMode = signal<SidebarMode>('default');
  private readonly _theme = signal<Theme>('light');
  private readonly _isLoading = signal(false);
  private readonly _isMobile = signal(false);

  readonly sidebarCollapsed = this._sidebarCollapsed.asReadonly();
  readonly sidebarMobileOpen = this._sidebarMobileOpen.asReadonly();
  readonly sidebarMode = this._sidebarMode.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isMobile = this._isMobile.asReadonly();

  readonly isDarkMode = computed(() => false);
  readonly isAdminMode = computed(() => this._sidebarMode() === 'admin');
  readonly isLibraryDetailMode = computed(() => this._sidebarMode() === 'library-detail');
  readonly isBackMode = computed(() => this._sidebarMode() === 'back');

  constructor() {
    // Effect: apply theme class to document - always light mode
    effect(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    });

    // Detect mobile on init and window resize
    if (isPlatformBrowser(this.platformId)) {
      this.checkIsMobile();
      window.addEventListener('resize', () => this.checkIsMobile());
    }
  }

  private checkIsMobile(): void {
    const isMobile = window.innerWidth < 768; // Tailwind md breakpoint
    this._isMobile.set(isMobile);
  }

  toggleSidebar(): void {
    this._sidebarCollapsed.update((v) => !v);
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this._sidebarCollapsed.set(collapsed);
  }

  toggleMobileSidebar(): void {
    this._sidebarMobileOpen.update((v) => !v);
  }

  closeMobileSidebar(): void {
    this._sidebarMobileOpen.set(false);
  }

  setSidebarMode(mode: SidebarMode): void {
    this._sidebarMode.set(mode);
  }

  enterAdminMode(): void {
    this._sidebarMode.set('admin');
  }

  exitAdminMode(): void {
    this._sidebarMode.set('default');
  }

  enterLibraryDetailMode(): void {
    this._sidebarMode.set('library-detail');
  }

  exitLibraryDetailMode(): void {
    this._sidebarMode.set('default');
  }

  enterBackSidebarMode(): void {
    this._sidebarMode.set('back');
  }

  exitResetSidebarMode(): void {
    this._sidebarMode.set('default');
  }

  setLoading(loading: boolean): void {
    this._isLoading.set(loading);
  }
}
