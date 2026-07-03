import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { TabItem } from '@app-types/tab.type';
import { I18nService } from '@core/i18n/i18n.service';
import { DropdownService } from '@core/services/dropdown.service';
import { UiStore } from '@core/stores/ui.store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TabComponent } from '@shared/components/tab/tab.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
/**
 * Reusable page header component
 *
 * Features:
 * - Mobile & Desktop responsive
 * - Optional sidebar toggle
 * - Optional action buttons (share, like, settings)
 * - Optional language toggle
 * - Optional tabs integration
 * - Customizable title
 *
 * @example
 * ```html
 * <app-page-header
 *   title="Dashboard"
 *   [showActions]="true"
 *   [showLanguageToggle]="true"
 *   [tabs]="myTabs()"
 *   [activeTabId]="activeTab()"
 *   (tabChange)="onTabChange($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, TabComponent, AppMatIconComponent],
  templateUrl: './page-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly uiStore = inject(UiStore);
  private readonly i18nService = inject(I18nService);
  private readonly translate = inject(TranslateService);
  private readonly location = inject(Location);

  // Inputs
  readonly title = input.required<string>();
  readonly titleKey = input<string>(); // Alternative: i18n key
  readonly showBackButton = input<boolean>(true);
  readonly showSidebarToggle = input<boolean>(true);
  readonly showBackButtonInMobile = input<boolean>(false);
  readonly showActions = input<boolean>(true);
  readonly showShareButton = input<boolean>(true);
  readonly showLikeButton = input<boolean>(true);
  readonly showSettingsButton = input<boolean>(true);
  readonly showSettingsMobileOnly = input<boolean>(false); // Show settings only on mobile
  readonly settingsIcon = input<'tune' | 'more_vert' | 'edit'>('tune'); // Settings icon type
  readonly showTitleEdit = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(true);
  readonly showLanguageToggleInMobile = input<boolean>(false);
  readonly showLanguageToggleInDesktop = input<boolean>(true);
  readonly tabs = input<TabItem[]>();
  readonly activeTabId = input<string>();
  readonly sticky = input<boolean>(true);
  readonly customTabsClass = input<string>('');

  // Outputs
  readonly backClick = output<void>();
  readonly shareClick = output<void>();
  readonly likeClick = output<void>();
  readonly settingsClick = output<void>();
  readonly renameClick = output<void>();
  readonly tabChange = output<TabItem>();

  // More menu dropdown state (used when settingsIcon === 'more_vert')
  readonly isMoreMenuOpen = signal<boolean>(false);
  private readonly dropdownService = inject(DropdownService);

  toggleSidebar() {
    this.uiStore.toggleMobileSidebar();
  }

  toggleMoreMenu(): void {
    if (this.isMoreMenuOpen()) {
      this.isMoreMenuOpen.set(false);
      this.dropdownService.notifyClosed();
    } else {
      this.isMoreMenuOpen.set(true);
      this.dropdownService.open(() => this.isMoreMenuOpen.set(false));
    }
  }

  handleRename(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    this.renameClick.emit();
  }

  handleMoreSettings(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    this.settingsClick.emit();
  }

  handleMoreShare(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    this.shareClick.emit();
  }

  handleMoreLike(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
    this.likeClick.emit();
  }

  goBack() {
    this.location.back();
  }

  toggleLanguage() {
    const currentLang = this.translate.getCurrentLang() || this.i18nService.resolveLanguage();
    const newLang = currentLang === 'en' ? 'ja' : 'en';
    void this.i18nService.setLanguage(newLang);
  }

  getCurrentLanguageDisplay(): string {
    const currentLang = this.translate.currentLang || this.translate.defaultLang;
    return currentLang === 'en' ? 'EN' : '日本語';
  }

  getTitle(): string {
    if (this.titleKey()) {
      return this.translate.instant(this.titleKey()!);
    }
    return this.title();
  }
}
