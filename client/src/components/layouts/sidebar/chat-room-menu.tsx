import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { useFloatingMenu, VIEWPORT_MARGIN_PX } from './use-floating-menu';

/** メニューの高さの見積もり（移植元 menuEstimatedHeightPx）。下に収まらないときに上へ出すかの判定に使う */
const MENU_ESTIMATED_HEIGHT_PX = 168;
/** ボタンとメニューの間の隙間（移植元 triggerGapPx） */
const TRIGGER_GAP_PX = 4;

const ITEM_CLASS =
  'flex h-9 w-full items-center gap-2 px-2 text-xs font-medium text-text-default transition-colors hover:rounded-lg hover:bg-surface-sidebar';
const DANGER_ITEM_CLASS =
  'flex h-9 w-full items-center gap-2 px-2 text-xs font-medium text-red-500 transition-colors hover:rounded-lg hover:bg-bg-error';
// 移植元は塗りつぶし（FILL 1）のアイコンを使う
const FILLED_ICON_CLASS = "[font-variation-settings:'FILL'_1,'wght'_400,'GRAD'_0,'opsz'_20]";

interface ChatRoomMenuProps {
  isOpen: boolean;
  isPinned: boolean;
  /** ボタンの下端 + 4px（下に出すときの top） */
  topPx: number;
  /** ボタンの上端（上に出すときの基準） */
  triggerTopPx: number;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** 移植元 shared/layouts/sidebar/components/chat-room-menu。ルームの「名前を変更・上部に固定・削除」メニュー */
export function ChatRoomMenu({
  isOpen,
  isPinned,
  topPx,
  triggerTopPx,
  onRename,
  onTogglePin,
  onDelete,
  onClose,
}: ChatRoomMenuProps) {
  const { t } = useTranslation();
  const { isDesktop, viewportHeight, visible, animationClass, desktopMaxHeightPx, onAnimationEnd } =
    useFloatingMenu(isOpen);

  if (!visible) return null;

  const aboveTop = triggerTopPx - MENU_ESTIMATED_HEIGHT_PX - TRIGGER_GAP_PX;
  const hasRoomBelow = topPx + MENU_ESTIMATED_HEIGHT_PX <= viewportHeight - VIEWPORT_MARGIN_PX;
  const menuTopPx = Math.max(hasRoomBelow ? topPx : aboveTop, VIEWPORT_MARGIN_PX);

  return (
    <>
      {/* 背面のクリックで閉じる。ほかの操作は通さない */}
      <div
        data-testid="chat-room-menu-backdrop"
        className="fixed inset-0 z-199 h-screen w-screen bg-bg-overlay md:bg-transparent!"
        onClick={onClose}
      />
      <div
        role="menu"
        className={`fixed bottom-0 left-0 z-200 flex w-screen flex-col gap-1 overflow-y-auto rounded-tl-lg rounded-tr-lg bg-white p-4 shadow-md md:bottom-auto! md:left-2! md:w-60 md:rounded-lg ${animationClass}`}
        style={
          isDesktop ? { top: `${menuTopPx}px`, maxHeight: `${desktopMaxHeightPx}px` } : undefined
        }
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={onAnimationEnd}
      >
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLASS}
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          <MatIcon name="border_color" />
          <span>{t('SIDEBAR.RENAME_CHAT')}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className={ITEM_CLASS}
          onClick={() => {
            onTogglePin();
            onClose();
          }}
        >
          <MatIcon name={isPinned ? 'keep_off' : 'push_pin'} className={FILLED_ICON_CLASS} />
          <span>{t(isPinned ? 'SIDEBAR.UNPIN_CHAT' : 'SIDEBAR.PIN_CHAT')}</span>
        </button>

        <hr className="mx-2 my-1 border-border-light" />

        <button
          type="button"
          role="menuitem"
          className={DANGER_ITEM_CLASS}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <MatIcon name="delete" className="text-red-500" />
          <span>{t('SIDEBAR.DELETE_CHAT')}</span>
        </button>
      </div>
    </>
  );
}
