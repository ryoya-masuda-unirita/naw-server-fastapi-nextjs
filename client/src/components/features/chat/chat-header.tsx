import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dropdownService } from '@/components/shared/dropdown-service';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { useUiStore } from '@/store/ui-store';

interface ChatHeaderProps {
  title: string;
  isReadOnly?: boolean;
  isHideName?: boolean;
  onRenameClick?: () => void;
  onShareClick?: () => void;
  onLikeClick?: () => void;
  /** モバイルのメニュー「ビューワーを開く」 */
  onSettingsClick?: () => void;
}

const THUMBS_UP_PATH =
  'M7.5026 18.3346H15.0026C15.6943 18.3346 16.2859 17.918 16.5359 17.318L19.0526 11.443C19.1276 11.2513 19.1693 11.0513 19.1693 10.8346V9.16797C19.1693 8.2513 18.4193 7.5013 17.5026 7.5013H12.2443L13.0359 3.69297L13.0609 3.4263C13.0609 3.08464 12.9193 2.76797 12.6943 2.54297L11.8109 1.66797L6.31927 7.15964C6.01927 7.45964 5.83594 7.8763 5.83594 8.33464V16.668C5.83594 17.5846 6.58594 18.3346 7.5026 18.3346ZM7.5026 8.33464L11.1193 4.71797L10.0026 9.16797H17.5026V10.8346L15.0026 16.668H7.5026V8.33464ZM0.835938 8.33464H4.16927V18.3346H0.835938V8.33464Z';

function PathIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** 移植元 `<app-chat-header>`。ルーム名・名前変更・共有・評価・（モバイルの）メニュー */
export function ChatHeader({
  title,
  isReadOnly = false,
  isHideName = false,
  onRenameClick,
  onShareClick,
  onLikeClick,
  onSettingsClick,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const toggleMobileSidebar = useUiStore((s) => s.toggleMobileSidebar);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const toggleMoreMenu = () => {
    if (isMoreMenuOpen) {
      setIsMoreMenuOpen(false);
      dropdownService.notifyClosed();
      return;
    }
    setIsMoreMenuOpen(true);
    dropdownService.open(() => setIsMoreMenuOpen(false));
  };

  /** メニューを閉じてから項目の処理を呼ぶ */
  const selectMenuItem = (action?: () => void) => {
    setIsMoreMenuOpen(false);
    dropdownService.notifyClosed();
    action?.();
  };

  return (
    <header className="shrink-0 flex items-center h-11 md:h-14 px-2 md:px-4 bg-bg-primary z-30">
      {/* LEFT: ハンバーガー（モバイルのみ） */}
      <button
        type="button"
        className="header-button-default md:hidden! w-7 h-7"
        onClick={toggleMobileSidebar}
        aria-label={t('HEADER.SIDEBAR_TOGGLE')}
      >
        <SvgIcon name="toggleSidebar" className="w-5 h-5 text-text-weak" />
      </button>

      {/* CENTER: タイトルと名前変更 */}
      <div className={`chat-page-header${isHideName ? ' hidden' : ''}`}>
        <h1 className="chat-page-header-title">{title}</h1>
        <button
          type="button"
          className={`header-button-default hidden md:flex${isReadOnly ? ' md:hidden!' : ''}`}
          onClick={() => onRenameClick?.()}
          aria-label={t('HEADER.RENAME')}
        >
          <SvgIcon name="edit" className="w-5 h-5 text-text-weak" />
        </button>
      </div>

      {/* RIGHT: 操作 */}
      <div className={`chat-page-header-actions${isHideName ? ' hidden' : ''}`}>
        <button
          type="button"
          data-testid="room-share-button"
          className={`header-button-default hidden! md:flex!${isReadOnly ? ' md:hidden!' : ''}`}
          onClick={() => onShareClick?.()}
          aria-label={t('HEADER.SHARE')}
        >
          <MatIcon name="share" size={20} className="text-text-lighter" />
        </button>

        <button
          type="button"
          className={`header-button-default hidden! md:flex!${isReadOnly ? ' md:hidden!' : ''}`}
          onClick={() => onLikeClick?.()}
          aria-label={t('HEADER.LIKE')}
        >
          <PathIcon d={THUMBS_UP_PATH} />
        </button>

        {/* モバイル: ··· メニュー */}
        <div className="relative dropdown md:hidden!">
          <button
            type="button"
            className="header-button-default"
            aria-label={t('HEADER.MORE')}
            aria-expanded={isMoreMenuOpen}
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              toggleMoreMenu();
            }}
          >
            <PathIcon d="M9.99563 16C9.58188 16 9.22917 15.8527 8.9375 15.5581C8.64583 15.2635 8.5 14.9094 8.5 14.4956C8.5 14.0819 8.64729 13.7292 8.94187 13.4375C9.23646 13.1458 9.59062 13 10.0044 13C10.4181 13 10.7708 13.1473 11.0625 13.4419C11.3542 13.7365 11.5 14.0906 11.5 14.5044C11.5 14.9181 11.3527 15.2708 11.0581 15.5625C10.7635 15.8542 10.4094 16 9.99563 16ZM9.99563 11.5C9.58188 11.5 9.22917 11.3527 8.9375 11.0581C8.64583 10.7635 8.5 10.4094 8.5 9.99563C8.5 9.58188 8.64729 9.22917 8.94187 8.9375C9.23646 8.64583 9.59062 8.5 10.0044 8.5C10.4181 8.5 10.7708 8.64729 11.0625 8.94188C11.3542 9.23646 11.5 9.59062 11.5 10.0044C11.5 10.4181 11.3527 10.7708 11.0581 11.0625C10.7635 11.3542 10.4094 11.5 9.99563 11.5ZM9.99563 7C9.58188 7 9.22917 6.85271 8.9375 6.55812C8.64583 6.26354 8.5 5.90937 8.5 5.49562C8.5 5.08187 8.64729 4.72917 8.94187 4.4375C9.23646 4.14583 9.59062 4 10.0044 4C10.4181 4 10.7708 4.14729 11.0625 4.44188C11.3542 4.73646 11.5 5.09063 11.5 5.50438C11.5 5.91813 11.3527 6.27083 11.0581 6.5625C10.7635 6.85417 10.4094 7 9.99563 7Z" />
          </button>

          <div
            className={`dropdown-menu dropdown-menu--bordered${isMoreMenuOpen ? ' is-open' : ''}`}
            role="menu"
            hidden={!isMoreMenuOpen}
          >
            <button
              type="button"
              className={`dropdown-item${isReadOnly ? ' hidden' : ''}`}
              role="menuitem"
              onClick={() => selectMenuItem(onRenameClick)}
            >
              <span className="dropdown-item-icon">
                <PathIcon d="M2 20V16H18V20H2ZM5.5 12.5H6.5625L12.375 6.6875L11.8333 6.125L11.3125 5.625L5.5 11.4375V12.5ZM4 14V10.8142L12.375 2.4375C12.5278 2.28472 12.6933 2.17361 12.8717 2.10417C13.0499 2.03472 13.2374 2 13.4342 2C13.6308 2 13.8194 2.03472 14 2.10417C14.1806 2.17361 14.3479 2.28431 14.5021 2.43625L15.5625 3.5C15.7153 3.65278 15.8264 3.81944 15.8958 4C15.9653 4.18056 16 4.37083 16 4.57083C16 4.75819 15.9656 4.9425 15.8969 5.12375C15.8281 5.305 15.7188 5.47062 15.5688 5.62062L7.1875 14H4ZM12.375 6.6875L11.8333 6.125L11.3125 5.625L12.375 6.6875Z" />
              </span>
              {t('HEADER.RENAME')}
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => selectMenuItem(onSettingsClick)}
            >
              <span className="flex justify-center items-center">
                <MatIcon name="dock_to_right" size={20} />
              </span>
              {t('HEADER.OPEN_VIEWER')}
            </button>
            <div className="dropdown-divider" />
            <button
              type="button"
              className={`dropdown-item${isReadOnly ? ' hidden' : ''}`}
              role="menuitem"
              onClick={() => selectMenuItem(onShareClick)}
            >
              <span className="flex justify-center items-center">
                <MatIcon name="shared" size={20} />
              </span>
              {t('HEADER.SHARE')}
            </button>
            <button
              type="button"
              className={`dropdown-item${isReadOnly ? ' hidden' : ''}`}
              role="menuitem"
              onClick={() => selectMenuItem(onLikeClick)}
            >
              <span className="dropdown-item-icon">
                <PathIcon d={THUMBS_UP_PATH} />
              </span>
              {t('HEADER.RATE')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
