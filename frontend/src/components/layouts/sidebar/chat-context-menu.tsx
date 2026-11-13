import { useTranslation } from 'react-i18next';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { useFloatingMenu, VIEWPORT_MARGIN_PX } from './use-floating-menu';

/** メニューの高さの見積もり（移植元 menuEstimatedHeightPx） */
const MENU_ESTIMATED_HEIGHT_PX = 80;
/** 開くボタンの高さの見積もり（移植元 triggerEstimatedHeightPx） */
const TRIGGER_ESTIMATED_HEIGHT_PX = 28;
/** ボタンとメニューの間の隙間（移植元 triggerGapPx） */
const TRIGGER_GAP_PX = 4;

interface ChatContextMenuProps {
  isOpen: boolean;
  /** 開くボタンの下端 + 4px */
  chatMenuTopPx: number;
  onDeleteSelected: () => void;
  onClose: () => void;
}

/** 移植元 shared/layouts/sidebar/components/chat-context-menu。「選択して削除」メニュー */
export function ChatContextMenu({
  isOpen,
  chatMenuTopPx,
  onDeleteSelected,
  onClose,
}: ChatContextMenuProps) {
  const { t } = useTranslation();
  const { isDesktop, viewportHeight, visible, animationClass, desktopMaxHeightPx, onAnimationEnd } =
    useFloatingMenu(isOpen);

  if (!visible) return null;

  const aboveTop =
    chatMenuTopPx - TRIGGER_ESTIMATED_HEIGHT_PX - MENU_ESTIMATED_HEIGHT_PX - TRIGGER_GAP_PX * 2;
  const hasRoomBelow =
    chatMenuTopPx + MENU_ESTIMATED_HEIGHT_PX <= viewportHeight - VIEWPORT_MARGIN_PX;
  const menuTopPx = Math.max(hasRoomBelow ? chatMenuTopPx : aboveTop, VIEWPORT_MARGIN_PX);

  return (
    <>
      <div
        data-testid="chat-context-menu-backdrop"
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
          className="flex h-9 w-full items-center gap-2 px-2 text-[12px] font-medium text-red-500 transition-colors hover:rounded-lg hover:bg-bg-error"
          onClick={onDeleteSelected}
        >
          <MatIcon name="delete" className="text-red-500" />
          <span>{t('SIDEBAR.DELETE_SELECTED')}</span>
        </button>
      </div>
    </>
  );
}
