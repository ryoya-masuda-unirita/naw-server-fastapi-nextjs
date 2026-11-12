import { useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/store/ui-store';
import { cx } from './class-names';
import { dropdownService } from './dropdown-service';
import { AppMatIcon, MatIcon } from './mat-icon';
import { Tab } from './tab';
import type { TabItem } from './types';

/** 移植元 I18nService と同じ保存先（i18n.ts もここから初期言語を読む） */
const LANGUAGE_STORAGE_KEY = 'language';

interface PageHeaderProps {
  title: string;
  /** 指定すると title の代わりにこの i18n キーを翻訳して表示する */
  titleKey?: string;
  showBackButton?: boolean;
  showSidebarToggle?: boolean;
  showBackButtonInMobile?: boolean;
  showActions?: boolean;
  showShareButton?: boolean;
  showLikeButton?: boolean;
  /** 移植元にあるがテンプレートでは使われていない（設定ボタンは常に出る） */
  showSettingsButton?: boolean;
  showSettingsMobileOnly?: boolean;
  settingsIcon?: 'tune' | 'more_vert' | 'edit';
  showTitleEdit?: boolean;
  showLanguageToggle?: boolean;
  showLanguageToggleInMobile?: boolean;
  /** 移植元にあるがテンプレートでは使われていない */
  showLanguageToggleInDesktop?: boolean;
  tabs?: TabItem[];
  activeTabId?: string;
  sticky?: boolean;
  /** 移植元にあるがテンプレートでは使われていない */
  customTabsClass?: string;
  /** 右側の操作群の末尾に足す要素（移植元の `[pageHeaderActions]` スロット） */
  actions?: ReactNode;
  onBackClick?: () => void;
  onShareClick?: () => void;
  onLikeClick?: () => void;
  onSettingsClick?: () => void;
  onRenameClick?: () => void;
  onTabChange?: (tab: TabItem) => void;
}

const ACTION_BUTTON_CLASS =
  'w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-text-lighter transition-colors';

/** 移植元 `<app-page-header>`（shared/components/page-header） */
export function PageHeader({
  title,
  titleKey,
  showBackButton = true,
  showSidebarToggle = true,
  showBackButtonInMobile = false,
  showActions = true,
  showShareButton = true,
  showLikeButton = true,
  showSettingsMobileOnly = false,
  settingsIcon = 'tune',
  showTitleEdit = false,
  showLanguageToggle = true,
  showLanguageToggleInMobile = false,
  tabs,
  activeTabId,
  sticky = true,
  actions,
  onBackClick,
  onShareClick,
  onLikeClick,
  onSettingsClick,
  onRenameClick,
  onTabChange,
}: PageHeaderProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toggleMobileSidebar = useUiStore((state) => state.toggleMobileSidebar);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const toggleMoreMenu = (event: MouseEvent) => {
    // document の click で dropdownService が即座に閉じないようにする
    event.stopPropagation();
    if (isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
      dropdownService.notifyClosed();
    } else {
      setIsMoreMenuOpen(true);
      dropdownService.open(() => setIsMoreMenuOpen(false));
    }
  };

  const runMoreAction = (action?: () => void) => {
    setIsMoreMenuOpen(false);
    dropdownService.notifyClosed();
    action?.();
  };

  const toggleLanguage = () => {
    const currentLang = i18n.language || localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'ja';
    const newLang = currentLang === 'en' ? 'ja' : 'en';
    void i18n.changeLanguage(newLang).then(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang));
  };

  const displayTitle = titleKey ? t(titleKey) : title;

  return (
    <header
      className={cx(
        'app-page-header shrink-0 flex flex-col bg-bg-primary z-30 border-b border-border-strong',
        sticky && 'sticky top-0 z-50',
      )}
    >
      <div className="flex items-center px-2 py-2 md:px-6 md:py-3">
        {showSidebarToggle && (
          <button
            className="lg:p-2 rounded-lg hover:bg-slate-100 shrink-0 md:hidden p-1"
            onClick={toggleMobileSidebar}
            title={t('HEADER.SIDEBAR_TOGGLE')}
          >
            <img src="/icons/icon-side-navigation.svg" alt={t('HEADER.SIDEBAR_TOGGLE')} className="size-5" />
          </button>
        )}
        {showBackButtonInMobile && (
          <button
            className="w-7 h-7 rounded-full hover:bg-slate-100 shrink-0 mr-2 flex items-center justify-center"
            onClick={() => onBackClick?.()}
            title={t('HEADER.BACK')}
          >
            <MatIcon icon="chevron_left" className="icon-20 text-text-lighter!" />
          </button>
        )}
        <div className="flex-1 min-w-0 ml-3 md:ml-0 items-center gap-1 flex">
          {showBackButton && (
            <button
              className="rounded-lg hover:bg-slate-100 shrink-0 lg:hidden block text-text-lighter relative top-0.75"
              onClick={() => navigate(-1)}
              title={t('HEADER.BACK')}
            >
              <AppMatIcon icon="chevron_left" className="text-[30px]!" />
            </button>
          )}
          <div className="flex items-center gap-1 min-w-0">
            <h2 className="min-h-9 pt-1 text-h1 truncate">{displayTitle}</h2>
            {showTitleEdit && (
              <button
                type="button"
                className="mt-1 p-1 rounded hover:bg-slate-100 text-text-lighter"
                onClick={() => onRenameClick?.()}
              >
                <MatIcon icon="edit" className="icon-16" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showActions && (
            <>
              {showShareButton && (
                <button
                  type="button"
                  className={ACTION_BUTTON_CLASS}
                  onClick={() => onShareClick?.()}
                  title={t('HEADER.SHARE')}
                >
                  <MatIcon icon="share" className="icon-20" />
                </button>
              )}
              {showLikeButton && (
                <button
                  type="button"
                  className={ACTION_BUTTON_CLASS}
                  onClick={() => onLikeClick?.()}
                  title={t('HEADER.LIKE')}
                >
                  <MatIcon icon="thumb_up" className="icon-20" />
                </button>
              )}
              {settingsIcon === 'more_vert' ? (
                <div className={cx('relative', showSettingsMobileOnly && 'lg:hidden')}>
                  <button
                    type="button"
                    className={ACTION_BUTTON_CLASS}
                    onClick={toggleMoreMenu}
                    title={t('HEADER.SETTINGS')}
                    aria-haspopup="true"
                    aria-expanded={isMoreMenuOpen}
                  >
                    <MatIcon icon="more_vert" className="icon-20" />
                  </button>
                  <div
                    className={cx('dropdown-menu dropdown-menu--bordered', isMoreMenuOpen && 'is-open')}
                    role="menu"
                    hidden={!isMoreMenuOpen}
                  >
                    <button
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      onClick={() => runMoreAction(onRenameClick)}
                    >
                      <span className="dropdown-item-icon">
                        <MatIcon icon="drive_file_rename_outline" className="w-5! h-5! text-xl!" />
                      </span>
                      {t('HEADER.RENAME')}
                    </button>
                    <button
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      onClick={() => runMoreAction(onSettingsClick)}
                    >
                      <span className="dropdown-item-icon">
                        <MatIcon icon="dock_to_right" className="w-5! h-5! text-xl!" />
                      </span>
                      {t('HEADER.OPEN_VIEWER')}
                    </button>
                    <div className="dropdown-divider" />
                    <button
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      onClick={() => runMoreAction(onShareClick)}
                    >
                      <span className="dropdown-item-icon">
                        <MatIcon icon="share" className="w-5! h-5! text-xl!" />
                      </span>
                      {t('HEADER.SHARE')}
                    </button>
                    <button
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      onClick={() => runMoreAction(onLikeClick)}
                    >
                      <span className="dropdown-item-icon">
                        <MatIcon icon="thumb_up" className="w-5! h-5! text-xl!" />
                      </span>
                      {t('HEADER.RATE')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={cx(ACTION_BUTTON_CLASS, showSettingsMobileOnly && 'lg:hidden')}
                  onClick={() => onSettingsClick?.()}
                  title={t('HEADER.SETTINGS')}
                >
                  <MatIcon icon={settingsIcon} className="icon-20" />
                </button>
              )}
            </>
          )}
          {actions}
          {showLanguageToggle && showLanguageToggleInMobile && (
            <button
              type="button"
              className="px-2 py-1 rounded-lg hover:bg-slate-100 text-text-lighter transition-colors text-xs font-medium"
              onClick={toggleLanguage}
              title={t('HEADER.LANGUAGE_TOGGLE')}
            >
              {i18n.language === 'en' ? 'EN' : '日本語'}
            </button>
          )}
        </div>
      </div>
      {tabs && tabs.length > 0 && (
        <div className="mt-1 md:mt-0 flex items-center gap-1 overflow-hidden">
          <Tab tabs={tabs} activeTabId={activeTabId || ''} onTabChange={onTabChange} />
        </div>
      )}
    </header>
  );
}
